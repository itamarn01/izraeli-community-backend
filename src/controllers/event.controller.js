const Event = require('../models/Event');
const EventRegistration = require('../models/EventRegistration');
const User = require('../models/User');
const { eventRegistrationSchema } = require('../validation/schemas');
const { sendEventRegistrationEmail } = require('../services/eventEmail');
const { buildEventIcs } = require('../services/calendar');

const todayStr = () => new Date().toISOString().slice(0, 10);

// Age in whole years as of a 'YYYY-MM-DD' date — used to gate which of a
// member's children are old enough to be offered for a given event.
// Both `dateStr` ('YYYY-MM-DD') and a child's `dateOfBirth` (cast from the
// same kind of date-only string by Mongoose) parse as UTC midnight, so UTC
// getters are used throughout — local getters would drift by a day on any
// server whose timezone isn't UTC.
function ageAt(dateOfBirth, dateStr) {
  const at = new Date(dateStr);
  const dob = new Date(dateOfBirth);
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday = at.getUTCMonth() < dob.getUTCMonth() ||
    (at.getUTCMonth() === dob.getUTCMonth() && at.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// The member's children old enough to attend this event, per the admin's
// configured minimum age. Used to populate the popup's checklist.
function eligibleChildren(event, user) {
  if (!event.childrenEnabled) return [];
  const minAge = event.childrenMinAge || 0;
  return (user.profile?.children || [])
    .filter((c) => c.dateOfBirth && ageAt(c.dateOfBirth, event.date) >= minAge)
    .map((c) => ({ _id: c._id, name: c.name, dateOfBirth: c.dateOfBirth }));
}

// ── Seat accounting ─────────────────────────────────────────────────────
// Seats live as counters on the Event document so a booking is claimed with a
// single guarded update. Counting registrations instead would let two members
// racing for the last slot both pass the check.

async function claimEventSeats(eventId, seats) {
  if (seats <= 0) return true;
  const updated = await Event.findOneAndUpdate(
    {
      _id: eventId,
      $or: [
        { capacity: 0 },
        { $expr: { $lte: [{ $add: ['$seatsTaken', seats] }, '$capacity'] } },
      ],
    },
    { $inc: { seatsTaken: seats } },
    { new: true }
  );
  return Boolean(updated);
}

async function releaseEventSeats(eventId, seats) {
  if (seats <= 0) return;
  await Event.updateOne({ _id: eventId }, { $inc: { seatsTaken: -seats } });
  await Event.updateOne({ _id: eventId, seatsTaken: { $lt: 0 } }, { $set: { seatsTaken: 0 } });
}

// `capacity` is read from the caller's snapshot; only an admin edit changes it,
// while `takenSeats` is compared atomically inside the query.
async function claimSlotSeats(eventId, tourId, slotId, seats, capacity) {
  if (seats <= 0) return true;
  const updated = await Event.findOneAndUpdate(
    {
      _id: eventId,
      tours: {
        $elemMatch: {
          _id: tourId,
          slots: { $elemMatch: { _id: slotId, takenSeats: { $lte: capacity - seats } } },
        },
      },
    },
    { $inc: { 'tours.$[t].slots.$[s].takenSeats': seats } },
    { arrayFilters: [{ 't._id': tourId }, { 's._id': slotId }], new: true }
  );
  return Boolean(updated);
}

async function releaseSlotSeats(eventId, tourId, slotId, seats) {
  if (seats <= 0) return;
  await Event.updateOne(
    { _id: eventId },
    { $inc: { 'tours.$[t].slots.$[s].takenSeats': -seats } },
    { arrayFilters: [{ 't._id': tourId }, { 's._id': slotId }] }
  );
  await Event.updateOne(
    { _id: eventId },
    { $set: { 'tours.$[t].slots.$[s].takenSeats': 0 } },
    { arrayFilters: [{ 't._id': tourId }, { 's._id': slotId, 's.takenSeats': { $lt: 0 } }] }
  );
}

// ── Serialization ───────────────────────────────────────────────────────
// Members see remaining seats, never the raw counters.
function serializeEvent(event, registration = null, user = null) {
  const obj = event.toObject ? event.toObject({ versionKey: false }) : { ...event };
  const closed = typeof event.isRegistrationClosed === 'function' ? event.isRegistrationClosed() : false;

  obj.seatsLeft = obj.capacity ? Math.max(0, obj.capacity - (obj.seatsTaken || 0)) : null;
  obj.isFull = obj.capacity ? obj.seatsTaken >= obj.capacity : false;
  obj.isRegistrationClosed = closed;
  obj.isPast = obj.date < todayStr();

  obj.tours = (obj.tours || []).map((t) => ({
    ...t,
    slots: (t.slots || []).map((s) => ({
      _id: s._id,
      time: s.time,
      capacity: s.capacity,
      seatsLeft: Math.max(0, s.capacity - (s.takenSeats || 0)),
      isFull: (s.takenSeats || 0) >= s.capacity,
    })),
  }));

  delete obj.seatsTaken;
  obj.myRegistration = registration
    ? {
        _id: registration._id,
        status: registration.status,
        hasSpouse: registration.hasSpouse,
        spouseName: registration.spouseName,
        childrenAttending: registration.childrenAttending || [],
        tour: registration.tour,
        seats: registration.seats,
        createdAt: registration.createdAt,
      }
    : null;
  obj.eligibleChildren = user ? eligibleChildren(event, user) : [];

  return obj;
}

// Events a member is allowed to see: their organization's, plus global ones.
function visibilityFilter(user) {
  const orgId = user.organization?._id || user.organization;
  return { $or: [{ organization: null }, { organization: orgId }] };
}

// ── Member endpoints ────────────────────────────────────────────────────

async function list(req, res, next) {
  try {
    const { scope = 'upcoming' } = req.query;
    const filter = visibilityFilter(req.user);
    if (scope === 'upcoming') filter.date = { $gte: todayStr() };
    else if (scope === 'past') filter.date = { $lt: todayStr() };

    const events = await Event.find(filter).sort({ date: scope === 'past' ? -1 : 1 });
    const regs = await EventRegistration.find({
      user: req.user._id,
      event: { $in: events.map((e) => e._id) },
    });
    const byEvent = new Map(regs.map((r) => [String(r.event), r]));

    res.json({ events: events.map((e) => serializeEvent(e, byEvent.get(String(e._id)) || null, req.user)) });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const event = await Event.findOne({ _id: req.params.id, ...visibilityFilter(req.user) });
    if (!event) return res.status(404).json({ message: 'האירוע לא נמצא' });
    const registration = await EventRegistration.findOne({ event: event._id, user: req.user._id });
    res.json({ event: serializeEvent(event, registration, req.user) });
  } catch (err) {
    next(err);
  }
}

// Public landing page — no auth. Registration itself still requires a member.
async function getPublic(req, res, next) {
  try {
    const { slug } = req.params;
    const query = /^[0-9a-fA-F]{24}$/.test(slug) ? { _id: slug } : { slug: String(slug).toLowerCase() };
    const event = await Event.findOne(query);
    if (!event) return res.status(404).json({ message: 'האירוע לא נמצא' });

    const obj = serializeEvent(event);
    delete obj.myRegistration;
    // Registration counts are internal; the public page only needs availability.
    res.json({ event: obj });
  } catch (err) {
    next(err);
  }
}

// The event whose popup should open when a member enters the app: one they have
// neither registered for nor declined. `prefer` lets the landing page CTA win.
async function popup(req, res, next) {
  try {
    const filter = {
      ...visibilityFilter(req.user),
      autoPopup: true,
      date: { $gte: todayStr() },
    };
    const events = await Event.find(filter).sort({ date: 1 });
    if (!events.length) return res.json({ event: null });

    const regs = await EventRegistration.find({
      user: req.user._id,
      event: { $in: events.map((e) => e._id) },
    }).select('event status');
    const answered = new Set(
      regs.filter((r) => r.status !== 'cancelled').map((r) => String(r.event))
    );

    const open = events.filter((e) => !e.isRegistrationClosed() && !answered.has(String(e._id)));
    const preferred = req.query.prefer && open.find((e) => String(e._id) === String(req.query.prefer));
    const chosen = preferred || open[0] || null;

    res.json({ event: chosen ? serializeEvent(chosen, null, req.user) : null });
  } catch (err) {
    next(err);
  }
}

// Validates the requested tour choice against the event and returns a snapshot.
function resolveTourChoice(event, { tourId, slotId, tourForBoth }, hasSpouse) {
  if (!tourId || !slotId) return { choice: null };
  if (!event.toursEnabled) return { error: 'לא הוגדרו סיורים לאירוע זה' };

  const tour = event.tours.id(tourId);
  if (!tour) return { error: 'הסיור לא נמצא' };
  const slot = tour.slots.id(slotId);
  if (!slot) return { error: 'שעת הסיור לא נמצאה' };

  const forBoth = Boolean(hasSpouse && tourForBoth);
  return {
    choice: {
      tourId: tour._id,
      slotId: slot._id,
      tourTitle: tour.title,
      time: slot.time,
      forBoth,
      seats: forBoth ? 2 : 1,
    },
    capacity: slot.capacity,
  };
}

// Validates the chosen child ids against the member's own profile and the
// event's minimum age, and returns a snapshot to store on the registration.
function resolveChildrenChoice(event, user, childrenIds) {
  if (!event.childrenEnabled || !childrenIds?.length) return { choice: [] };

  const minAge = event.childrenMinAge || 0;
  const children = user.profile?.children;
  const choice = [];
  for (const id of childrenIds) {
    const child = children?.id ? children.id(id) : (children || []).find((c) => String(c._id) === String(id));
    if (!child) return { error: 'אחד הילדים שנבחרו לא נמצא בפרופיל' };
    if (ageAt(child.dateOfBirth, event.date) < minAge) {
      return { error: `הגיל המינימלי להשתתפות ילדים באירוע זה הוא ${minAge}` };
    }
    choice.push({ childId: child._id, name: child.name, dateOfBirth: child.dateOfBirth });
  }
  return { choice };
}

function sameSlot(a, b) {
  return a && b && String(a.slotId) === String(b.slotId) && String(a.tourId) === String(b.tourId);
}

/**
 * Moves a member from `previous` to `next` seat-wise. Claims are taken before
 * releases so a failed change never costs the member the booking they had.
 * Returns an error message, or null on success.
 */
async function applySeatChanges(event, previous, next) {
  const prevSeats = previous?.status === 'registered' ? previous.seats || 0 : 0;
  const nextSeats = next.seats;
  const eventDelta = nextSeats - prevSeats;

  if (eventDelta > 0 && !(await claimEventSeats(event._id, eventDelta))) {
    return 'לא נותרו מספיק מקומות פנויים לאירוע';
  }

  const prevTour = previous?.status === 'registered' ? previous.tour : null;
  const nextTour = next.tour;
  const rollbackEvent = async () => {
    if (eventDelta > 0) await releaseEventSeats(event._id, eventDelta);
  };

  if (sameSlot(prevTour, nextTour)) {
    const delta = (nextTour.seats || 0) - (prevTour.seats || 0);
    if (delta > 0) {
      const slot = event.tours.id(nextTour.tourId)?.slots.id(nextTour.slotId);
      const ok = await claimSlotSeats(event._id, nextTour.tourId, nextTour.slotId, delta, slot?.capacity ?? 0);
      if (!ok) {
        await rollbackEvent();
        return 'אין מספיק מקומות פנויים בשעת הסיור שנבחרה';
      }
    } else if (delta < 0) {
      await releaseSlotSeats(event._id, nextTour.tourId, nextTour.slotId, -delta);
    }
  } else {
    if (nextTour) {
      const slot = event.tours.id(nextTour.tourId)?.slots.id(nextTour.slotId);
      const ok = await claimSlotSeats(
        event._id,
        nextTour.tourId,
        nextTour.slotId,
        nextTour.seats,
        slot?.capacity ?? 0
      );
      if (!ok) {
        await rollbackEvent();
        return 'שעת הסיור שנבחרה התמלאה — יש לבחור שעה אחרת';
      }
    }
    if (prevTour) {
      await releaseSlotSeats(event._id, prevTour.tourId, prevTour.slotId, prevTour.seats || 1);
    }
  }

  if (eventDelta < 0) await releaseEventSeats(event._id, -eventDelta);
  return null;
}

async function saveRegistration(req, res, next, { isUpdate }) {
  try {
    const event = await Event.findOne({ _id: req.params.id, ...visibilityFilter(req.user) });
    if (!event) return res.status(404).json({ message: 'האירוע לא נמצא' });
    if (event.isRegistrationClosed()) {
      return res.status(400).json({ message: 'ההרשמה לאירוע זה סגורה' });
    }

    const data = eventRegistrationSchema.parse(req.body);
    const hasSpouse = Boolean(event.allowSpouse && data.hasSpouse);

    const { choice, error } = resolveTourChoice(event, data, hasSpouse);
    if (error) return res.status(400).json({ message: error });

    const childrenResult = resolveChildrenChoice(event, req.user, data.childrenIds);
    if (childrenResult.error) return res.status(400).json({ message: childrenResult.error });
    const children = childrenResult.choice;

    const previous = await EventRegistration.findOne({ event: event._id, user: req.user._id });
    if (!isUpdate && previous?.status === 'registered') {
      return res.status(409).json({ message: 'כבר נרשמת לאירוע זה' });
    }

    const nextState = { seats: (hasSpouse ? 2 : 1) + children.length, tour: choice };
    const seatError = await applySeatChanges(event, previous, nextState);
    if (seatError) return res.status(409).json({ message: seatError });

    const payload = {
      event: event._id,
      user: req.user._id,
      organization: req.user.organization?._id || req.user.organization,
      status: 'registered',
      hasSpouse,
      spouseName: hasSpouse ? data.spouseName.trim() : '',
      childrenAttending: children,
      tour: choice,
      seats: nextState.seats,
    };

    let registration;
    try {
      registration = await EventRegistration.findOneAndUpdate(
        { event: event._id, user: req.user._id },
        { $set: payload },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      // Give the seats back rather than leaving them held by a row that failed.
      await applySeatChanges(event, { ...nextState, status: 'registered' }, { seats: 0, tour: null });
      throw err;
    }

    const fresh = await Event.findById(event._id);
    res.status(isUpdate ? 200 : 201).json({
      event: serializeEvent(fresh, registration, req.user),
      registration,
    });

    // Email is best-effort and must not fail the booking.
    const user = await User.findById(req.user._id).select('email profile');
    sendEventRegistrationEmail({
      to: user.email,
      userName: [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' '),
      event: fresh,
      registration,
      kind: isUpdate ? 'updated' : 'created',
      appUrl: process.env.CLIENT_URL || (process.env.CLIENT_ORIGIN || '').split(',')[0],
      apiUrl: process.env.API_URL || `${req.protocol}://${req.get('host')}`,
    })
      .then(() =>
        EventRegistration.updateOne({ _id: registration._id }, { $set: { confirmationSentAt: new Date() } })
      )
      .catch((err) => console.error('Event confirmation email failed:', err.message));
  } catch (err) {
    next(err);
  }
}

const register = (req, res, next) => saveRegistration(req, res, next, { isUpdate: false });
const updateRegistration = (req, res, next) => saveRegistration(req, res, next, { isUpdate: true });

async function cancelRegistration(req, res, next) {
  try {
    const event = await Event.findOne({ _id: req.params.id, ...visibilityFilter(req.user) });
    if (!event) return res.status(404).json({ message: 'האירוע לא נמצא' });

    const registration = await EventRegistration.findOne({ event: event._id, user: req.user._id });
    if (!registration || registration.status !== 'registered') {
      return res.status(404).json({ message: 'לא נמצאה הרשמה פעילה' });
    }

    await applySeatChanges(event, registration, { seats: 0, tour: null });

    registration.status = 'cancelled';
    registration.tour = null;
    registration.seats = 0;
    registration.hasSpouse = false;
    registration.spouseName = '';
    registration.childrenAttending = [];
    await registration.save();

    const fresh = await Event.findById(event._id);
    res.json({ event: serializeEvent(fresh, registration, req.user) });

    const user = await User.findById(req.user._id).select('email profile');
    sendEventRegistrationEmail({
      to: user.email,
      userName: [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' '),
      event: fresh,
      registration,
      kind: 'cancelled',
      appUrl: process.env.CLIENT_URL || (process.env.CLIENT_ORIGIN || '').split(',')[0],
    }).catch((err) => console.error('Event cancellation email failed:', err.message));
  } catch (err) {
    next(err);
  }
}

// "לא מעוניין/ת כרגע" — remembered so the popup stops opening on every login.
async function decline(req, res, next) {
  try {
    const event = await Event.findOne({ _id: req.params.id, ...visibilityFilter(req.user) });
    if (!event) return res.status(404).json({ message: 'האירוע לא נמצא' });

    const existing = await EventRegistration.findOne({ event: event._id, user: req.user._id });
    if (existing?.status === 'registered') {
      return res.status(409).json({ message: 'יש לבטל את ההרשמה הקיימת תחילה' });
    }

    const registration = await EventRegistration.findOneAndUpdate(
      { event: event._id, user: req.user._id },
      {
        $set: {
          event: event._id,
          user: req.user._id,
          organization: req.user.organization?._id || req.user.organization,
          status: 'declined',
          hasSpouse: false,
          spouseName: '',
          childrenAttending: [],
          tour: null,
          seats: 0,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ registration });
  } catch (err) {
    next(err);
  }
}

// Personal .ics download — public, since the event details themselves are public.
async function downloadIcs(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'האירוע לא נמצא' });

    let tour = null;
    if (req.query.slot) {
      for (const t of event.tours) {
        const slot = t.slots.id(req.query.slot);
        if (slot) {
          tour = { tourTitle: t.title, time: slot.time, slotId: slot._id };
          break;
        }
      }
    }

    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="event-${event._id}.ics"`,
    });
    res.send(buildEventIcs(event, tour));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  getOne,
  getPublic,
  popup,
  register,
  updateRegistration,
  cancelRegistration,
  decline,
  downloadIcs,
  serializeEvent,
  claimEventSeats,
  releaseEventSeats,
  claimSlotSeats,
  releaseSlotSeats,
};
