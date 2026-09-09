const ExcelJS = require('exceljs');
const Event = require('../../models/Event');
const EventRegistration = require('../../models/EventRegistration');
const Organization = require('../../models/Organization');
const { eventInputSchema } = require('../../validation/schemas');
const { createNotification } = require('../../services/notifications');
const { formatEventDate } = require('../../services/eventEmail');
const { releaseEventSeats, releaseSlotSeats } = require('../event.controller');

const todayStr = () => new Date().toISOString().slice(0, 10);

// ── Slug ────────────────────────────────────────────────────────────────
function slugify(input) {
  const base = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/["'׳״]/g, '')
    .replace(/[^a-z0-9֐-׿]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'event';
}

async function uniqueSlug(desired, excludeId = null) {
  const base = slugify(desired);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await Event.findOne({ slug: candidate, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
    if (!clash) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// ── Tours ───────────────────────────────────────────────────────────────
// Incoming tours come from an admin form that has no idea how many seats are
// already booked, so existing counters are carried over by id.
function mergeTours(incoming, existing = []) {
  const prevTours = new Map(existing.map((t) => [String(t._id), t]));
  return (incoming || []).map((tour) => {
    const prev = tour._id ? prevTours.get(String(tour._id)) : null;
    const prevSlots = new Map((prev?.slots || []).map((s) => [String(s._id), s]));
    return {
      ...(tour._id ? { _id: tour._id } : {}),
      title: tour.title,
      description: tour.description || '',
      slots: (tour.slots || []).map((slot) => {
        const prevSlot = slot._id ? prevSlots.get(String(slot._id)) : null;
        return {
          ...(slot._id ? { _id: slot._id } : {}),
          time: slot.time,
          capacity: slot.capacity,
          takenSeats: prevSlot?.takenSeats || 0,
        };
      }),
    };
  });
}

// Refuses to drop a tour or hour that people already booked.
function findDroppedWithBookings(incoming, existing = []) {
  const keptTours = new Set((incoming || []).filter((t) => t._id).map((t) => String(t._id)));
  const dropped = [];
  for (const tour of existing) {
    const stillThere = keptTours.has(String(tour._id));
    const nextTour = (incoming || []).find((t) => String(t._id) === String(tour._id));
    const keptSlots = new Set((nextTour?.slots || []).filter((s) => s._id).map((s) => String(s._id)));
    for (const slot of tour.slots || []) {
      if ((slot.takenSeats || 0) > 0 && (!stillThere || !keptSlots.has(String(slot._id)))) {
        dropped.push(`${tour.title} · ${slot.time}`);
      }
    }
  }
  return dropped;
}

function notifyEvent(event, organizations) {
  const body = event.summary || `${formatEventDate(event.date)}${event.location ? ` · ${event.location}` : ''}`;
  return Promise.all(
    organizations.map((orgId) =>
      createNotification({
        organization: orgId,
        type: 'event',
        title: `אירוע חדש: ${event.title}`,
        body,
        resourceId: event._id,
      })
    )
  );
}

// A global event has no organization of its own, so one notification per org.
async function targetOrganizations(event) {
  if (event.organization) return [event.organization];
  const orgs = await Organization.find({ isActive: { $ne: false } }).select('_id');
  return orgs.map((o) => o._id);
}

const EMPTY_STATS = { registrations: 0, attendees: 0, spouses: 0, children: 0, tourRegistrations: 0 };

// Registration counts keyed by event id, for the list cards.
async function countsByEvent(eventIds) {
  if (!eventIds.length) return new Map();
  const rows = await EventRegistration.aggregate([
    { $match: { event: { $in: eventIds }, status: 'registered' } },
    {
      $group: {
        _id: '$event',
        registrations: { $sum: 1 },
        attendees: { $sum: '$seats' },
        spouses: { $sum: { $cond: ['$hasSpouse', 1, 0] } },
        children: { $sum: { $size: { $ifNull: ['$childrenAttending', []] } } },
        tourRegistrations: { $sum: { $cond: [{ $ifNull: ['$tour', false] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

// Every endpoint that hands an event back to the admin UI includes `stats`, so
// the list card can render a freshly created event without a reload.
async function withStats(event) {
  const counts = await countsByEvent([event._id]);
  return { ...event.toObject({ versionKey: false }), stats: counts.get(String(event._id)) || { ...EMPTY_STATS } };
}

// ── CRUD ────────────────────────────────────────────────────────────────

async function list(req, res, next) {
  try {
    const { q, organization, scope, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (organization === 'global') filter.organization = null;
    else if (organization) filter.organization = organization;
    if (scope === 'upcoming') filter.date = { $gte: todayStr() };
    else if (scope === 'past') filter.date = { $lt: todayStr() };
    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { summary: { $regex: q, $options: 'i' } },
        { location: { $regex: q, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [events, total] = await Promise.all([
      Event.find(filter).sort({ date: -1 }).skip(skip).limit(Number(limit)).populate('organization', 'name code'),
      Event.countDocuments(filter),
    ]);

    const byEvent = await countsByEvent(events.map((e) => e._id));

    res.json({
      events: events.map((e) => ({
        ...e.toObject({ versionKey: false }),
        stats: byEvent.get(String(e._id)) || { ...EMPTY_STATS },
      })),
      hasMore: skip + events.length < total,
      total,
    });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const event = await Event.findById(req.params.id).populate('organization', 'name code');
    if (!event) return res.status(404).json({ message: 'האירוע לא נמצא' });
    res.json({ event: await withStats(event) });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = eventInputSchema.parse(req.body);
    const organization = req.body.organization || null;

    const event = await Event.create({
      ...data,
      slug: await uniqueSlug(data.slug || data.title),
      tours: mergeTours(data.tours, []),
      organization,
      createdBy: req.admin._id,
    });

    // Resolve the notification targets before populating, so `organization` is
    // still a plain id rather than a document.
    const targets = await targetOrganizations(event);

    await event.populate('organization', 'name code');
    res.status(201).json({ event: await withStats(event) });
    notifyEvent(event, targets).catch(() => {});
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const existing = await Event.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'האירוע לא נמצא' });

    const data = eventInputSchema.partial().parse(req.body);

    if (data.tours) {
      const dropped = findDroppedWithBookings(data.tours, existing.tours);
      if (dropped.length) {
        return res.status(409).json({
          message: `לא ניתן למחוק שעות שכבר יש בהן נרשמים: ${dropped.join(', ')}. יש לבטל תחילה את ההרשמות לשעות אלו.`,
        });
      }
      data.tours = mergeTours(data.tours, existing.tours);
    }

    if (data.slug !== undefined) {
      data.slug = await uniqueSlug(data.slug || data.title || existing.title, existing._id);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'organization')) {
      data.organization = req.body.organization || null;
    }

    const event = await Event.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true })
      .populate('organization', 'name code');
    res.json({ event: await withStats(event) });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ message: 'האירוע לא נמצא' });
    await EventRegistration.deleteMany({ event: event._id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ── Registrations ───────────────────────────────────────────────────────

function buildStats(event, registrations) {
  const active = registrations.filter((r) => r.status === 'registered');
  const slotCounts = new Map();
  for (const reg of active) {
    if (!reg.tour) continue;
    const key = String(reg.tour.slotId);
    const entry = slotCounts.get(key) || { people: 0, registrations: 0 };
    entry.people += reg.tour.seats || 1;
    entry.registrations += 1;
    slotCounts.set(key, entry);
  }

  const slots = [];
  for (const tour of event.tours || []) {
    for (const slot of tour.slots || []) {
      const c = slotCounts.get(String(slot._id)) || { people: 0, registrations: 0 };
      slots.push({
        tourId: tour._id,
        tourTitle: tour.title,
        slotId: slot._id,
        time: slot.time,
        capacity: slot.capacity,
        takenSeats: slot.takenSeats || 0,
        people: c.people,
        registrations: c.registrations,
        seatsLeft: Math.max(0, slot.capacity - (slot.takenSeats || 0)),
      });
    }
  }
  slots.sort((a, b) => a.tourTitle.localeCompare(b.tourTitle, 'he') || a.time.localeCompare(b.time));

  return {
    registrations: active.length,
    attendees: active.reduce((sum, r) => sum + (r.seats || 0), 0),
    spouses: active.filter((r) => r.hasSpouse).length,
    childrenRegistrations: active.filter((r) => r.childrenAttending?.length).length,
    children: active.reduce((sum, r) => sum + (r.childrenAttending?.length || 0), 0),
    tourRegistrations: active.filter((r) => r.tour).length,
    tourPeople: active.reduce((sum, r) => sum + (r.tour?.seats || 0), 0),
    declined: registrations.filter((r) => r.status === 'declined').length,
    cancelled: registrations.filter((r) => r.status === 'cancelled').length,
    capacity: event.capacity,
    seatsLeft: event.capacity ? Math.max(0, event.capacity - event.seatsTaken) : null,
    slots,
  };
}

const USER_FIELDS = 'email profile.firstName profile.lastName profile.phone profile.gedud profile.address organization';

async function listRegistrations(req, res, next) {
  try {
    const event = await Event.findById(req.params.id).populate('organization', 'name code');
    if (!event) return res.status(404).json({ message: 'האירוע לא נמצא' });

    const registrations = await EventRegistration.find({ event: event._id })
      .populate({ path: 'user', select: USER_FIELDS, populate: { path: 'organization', select: 'name code' } })
      .sort({ createdAt: -1 });

    res.json({ event, registrations, stats: buildStats(event, registrations) });
  } catch (err) {
    next(err);
  }
}

// Admin-side removal — releases the seats the member was holding.
async function removeRegistration(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'האירוע לא נמצא' });

    const registration = await EventRegistration.findOne({ _id: req.params.regId, event: event._id });
    if (!registration) return res.status(404).json({ message: 'ההרשמה לא נמצאה' });

    if (registration.status === 'registered') {
      await releaseEventSeats(event._id, registration.seats || 0);
      if (registration.tour) {
        await releaseSlotSeats(
          event._id,
          registration.tour.tourId,
          registration.tour.slotId,
          registration.tour.seats || 1
        );
      }
    }

    await registration.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ── Excel export ────────────────────────────────────────────────────────

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3A3A3A' } };
const ACCENT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCB8333' } };

function addSheet(workbook, name, columns) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = columns;
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
  header.fill = HEADER_FILL;
  header.alignment = { vertical: 'middle', horizontal: 'right' };
  header.height = 22;
  return sheet;
}

function fullName(user) {
  return [user?.profile?.firstName, user?.profile?.lastName].filter(Boolean).join(' ');
}

// See the matching comment on ageAt() in event.controller.js: UTC getters
// throughout, since both operands parse as UTC midnight regardless of the
// server's own timezone.
function ageAtEventDate(dateOfBirth, eventDate) {
  const at = new Date(eventDate);
  const dob = new Date(dateOfBirth);
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday = at.getUTCMonth() < dob.getUTCMonth() ||
    (at.getUTCMonth() === dob.getUTCMonth() && at.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

async function exportRegistrations(req, res, next) {
  try {
    const event = await Event.findById(req.params.id).populate('organization', 'name code');
    if (!event) return res.status(404).json({ message: 'האירוע לא נמצא' });

    const registrations = await EventRegistration.find({ event: event._id })
      .populate({ path: 'user', select: USER_FIELDS, populate: { path: 'organization', select: 'name code' } })
      .sort({ createdAt: 1 });

    const active = registrations.filter((r) => r.status === 'registered');
    const stats = buildStats(event, registrations);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'חברותא 186';
    workbook.created = new Date();

    // 1 — Summary
    const summary = addSheet(workbook, 'סיכום', [
      { header: 'נתון', key: 'label', width: 34 },
      { header: 'ערך', key: 'value', width: 44 },
    ]);
    const summaryRows = [
      ['אירוע', event.title],
      ['תאריך', formatEventDate(event.date)],
      ['שעות', [event.startTime, event.endTime].filter(Boolean).join(' – ')],
      ['מיקום', event.location || ''],
      ['ארגון', event.organization?.name || 'כל הארגונים'],
      ['נרשמים לעצרת (חיילים)', stats.registrations],
      ['בני/בנות זוג', stats.spouses],
      ['ילדים רשומים', stats.children],
      ['סה"כ משתתפים', stats.attendees],
      ['נרשמים לסיורים', stats.tourRegistrations],
      ['סה"כ מקומות שנתפסו בסיורים', stats.tourPeople],
      ['ביטולים', stats.cancelled],
      ['סימנו "לא מגיע"', stats.declined],
      ['קיבולת האירוע', event.capacity ? event.capacity : 'ללא הגבלה'],
      ['מקומות פנויים', stats.seatsLeft === null ? 'ללא הגבלה' : stats.seatsLeft],
      ['הופק בתאריך', new Date().toLocaleString('he-IL')],
    ];
    summaryRows.forEach(([label, value]) => {
      const row = summary.addRow({ label, value });
      row.getCell('label').font = { bold: true };
    });

    // 2 — Attendees
    const attendees = addSheet(workbook, 'נרשמים לעצרת', [
      { header: '#', key: 'idx', width: 6 },
      { header: 'שם פרטי', key: 'firstName', width: 16 },
      { header: 'שם משפחה', key: 'lastName', width: 16 },
      { header: 'גדוד / מסגרת', key: 'gedud', width: 18 },
      { header: 'טלפון', key: 'phone', width: 16 },
      { header: 'אימייל', key: 'email', width: 28 },
      { header: 'עיר', key: 'city', width: 14 },
      { header: 'ארגון', key: 'org', width: 18 },
      { header: 'בן/בת זוג', key: 'spouse', width: 20 },
      { header: 'מס׳ ילדים', key: 'childrenCount', width: 12 },
      { header: 'שמות הילדים', key: 'childrenNames', width: 26 },
      { header: 'מס׳ משתתפים', key: 'seats', width: 14 },
      { header: 'סיור', key: 'tour', width: 22 },
      { header: 'שעת סיור', key: 'tourTime', width: 12 },
      { header: 'הסיור כולל בן/בת זוג', key: 'tourForBoth', width: 20 },
      { header: 'תאריך הרשמה', key: 'created', width: 20 },
    ]);
    active.forEach((reg, i) => {
      attendees.addRow({
        idx: i + 1,
        firstName: reg.user?.profile?.firstName || '',
        lastName: reg.user?.profile?.lastName || '',
        gedud: reg.user?.profile?.gedud || '',
        phone: reg.user?.profile?.phone || '',
        email: reg.user?.email || '',
        city: reg.user?.profile?.address?.city || '',
        org: reg.user?.organization?.name || '',
        spouse: reg.hasSpouse ? reg.spouseName || 'כן' : '',
        childrenCount: reg.childrenAttending?.length || 0,
        childrenNames: (reg.childrenAttending || []).map((c) => c.name).join(', '),
        seats: reg.seats,
        tour: reg.tour?.tourTitle || '',
        tourTime: reg.tour?.time || '',
        tourForBoth: reg.tour ? (reg.tour.forBoth ? 'כן' : 'לא') : '',
        created: new Date(reg.createdAt).toLocaleString('he-IL'),
      });
    });

    // 3 — Spouses
    const spouses = addSheet(workbook, 'בני ובנות זוג', [
      { header: '#', key: 'idx', width: 6 },
      { header: 'שם בן/בת הזוג', key: 'spouse', width: 24 },
      { header: 'מגיע/ה עם', key: 'member', width: 24 },
      { header: 'גדוד / מסגרת', key: 'gedud', width: 18 },
      { header: 'טלפון החייל/ת', key: 'phone', width: 16 },
      { header: 'משתתף/ת בסיור', key: 'tour', width: 24 },
    ]);
    active
      .filter((r) => r.hasSpouse)
      .forEach((reg, i) => {
        spouses.addRow({
          idx: i + 1,
          spouse: reg.spouseName || '',
          member: fullName(reg.user),
          gedud: reg.user?.profile?.gedud || '',
          phone: reg.user?.profile?.phone || '',
          tour: reg.tour?.forBoth ? `${reg.tour.tourTitle} · ${reg.tour.time}` : 'לא',
        });
      });

    // 3.5 — Children
    const children = addSheet(workbook, 'ילדים', [
      { header: '#', key: 'idx', width: 6 },
      { header: 'שם הילד/ה', key: 'name', width: 22 },
      { header: 'גיל ביום האירוע', key: 'age', width: 16 },
      { header: 'הורה/ת רשום/ה', key: 'member', width: 24 },
      { header: 'גדוד / מסגרת', key: 'gedud', width: 18 },
      { header: 'טלפון', key: 'phone', width: 16 },
    ]);
    let childIdx = 0;
    active.forEach((reg) => {
      (reg.childrenAttending || []).forEach((child) => {
        childIdx += 1;
        children.addRow({
          idx: childIdx,
          name: child.name || '',
          age: child.dateOfBirth ? ageAtEventDate(child.dateOfBirth, event.date) : '',
          member: fullName(reg.user),
          gedud: reg.user?.profile?.gedud || '',
          phone: reg.user?.profile?.phone || '',
        });
      });
    });

    // 4 — Tour registrations
    const tours = addSheet(workbook, 'נרשמי סיורים', [
      { header: '#', key: 'idx', width: 6 },
      { header: 'סיור', key: 'tour', width: 24 },
      { header: 'שעה', key: 'time', width: 10 },
      { header: 'שם מלא', key: 'member', width: 24 },
      { header: 'גדוד / מסגרת', key: 'gedud', width: 18 },
      { header: 'טלפון', key: 'phone', width: 16 },
      { header: 'אימייל', key: 'email', width: 28 },
      { header: 'בן/בת זוג בסיור', key: 'spouse', width: 22 },
      { header: 'מקומות', key: 'seats', width: 10 },
    ]);
    active
      .filter((r) => r.tour)
      .sort((a, b) => a.tour.time.localeCompare(b.tour.time))
      .forEach((reg, i) => {
        tours.addRow({
          idx: i + 1,
          tour: reg.tour.tourTitle,
          time: reg.tour.time,
          member: fullName(reg.user),
          gedud: reg.user?.profile?.gedud || '',
          phone: reg.user?.profile?.phone || '',
          email: reg.user?.email || '',
          spouse: reg.tour.forBoth ? reg.spouseName || 'כן' : 'לא',
          seats: reg.tour.seats || 1,
        });
      });

    // 5 — Per-slot breakdown
    const slots = addSheet(workbook, 'חלוקה לפי סלוטים', [
      { header: 'סיור', key: 'tour', width: 26 },
      { header: 'שעה', key: 'time', width: 10 },
      { header: 'מכסה', key: 'capacity', width: 10 },
      { header: 'תפוסים', key: 'taken', width: 10 },
      { header: 'פנויים', key: 'left', width: 10 },
      { header: 'מס׳ הרשמות', key: 'regs', width: 14 },
      { header: 'תפוסה', key: 'pct', width: 12 },
    ]);
    stats.slots.forEach((s) => {
      const row = slots.addRow({
        tour: s.tourTitle,
        time: s.time,
        capacity: s.capacity,
        taken: s.takenSeats,
        left: s.seatsLeft,
        regs: s.registrations,
        pct: s.capacity ? s.takenSeats / s.capacity : 0,
      });
      row.getCell('pct').numFmt = '0%';
      if (s.seatsLeft === 0) row.getCell('left').fill = ACCENT_FILL;
    });

    // 6 — Gedud breakdown, the segmentation the brigade asked for
    const gedudCounts = new Map();
    active.forEach((reg) => {
      const key = reg.user?.profile?.gedud || 'לא צוין';
      const entry = gedudCounts.get(key) || { soldiers: 0, spouses: 0, tour: 0 };
      entry.soldiers += 1;
      if (reg.hasSpouse) entry.spouses += 1;
      if (reg.tour) entry.tour += 1;
      gedudCounts.set(key, entry);
    });
    const byGedud = addSheet(workbook, 'פילוח לפי גדוד', [
      { header: 'גדוד / מסגרת', key: 'gedud', width: 24 },
      { header: 'חיילים', key: 'soldiers', width: 12 },
      { header: 'בני/בנות זוג', key: 'spouses', width: 16 },
      { header: 'סה"כ משתתפים', key: 'total', width: 16 },
      { header: 'נרשמים לסיור', key: 'tour', width: 16 },
    ]);
    [...gedudCounts.entries()]
      .sort((a, b) => b[1].soldiers - a[1].soldiers)
      .forEach(([gedud, c]) => {
        byGedud.addRow({
          gedud,
          soldiers: c.soldiers,
          spouses: c.spouses,
          total: c.soldiers + c.spouses,
          tour: c.tour,
        });
      });

    const buffer = await workbook.xlsx.writeBuffer();
    // HTTP headers are latin-1, and slugs/titles here are usually Hebrew: the
    // plain `filename` must stay ASCII, with the real name in RFC 5987 form.
    const asciiName = (event.slug || '').replace(/[^A-Za-z0-9._-]/g, '') || `event-${event._id}`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${asciiName}-registrations.xlsx"; filename*=UTF-8''${encodeURIComponent(
        `${event.title}.xlsx`
      )}`,
      'Content-Length': buffer.byteLength,
    });
    res.end(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
  listRegistrations,
  removeRegistration,
  exportRegistrations,
};
