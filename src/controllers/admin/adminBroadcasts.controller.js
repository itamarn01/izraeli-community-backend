const { z } = require('zod');
const Broadcast = require('../../models/Broadcast');
const User = require('../../models/User');
const Event = require('../../models/Event');
const EventRegistration = require('../../models/EventRegistration');
const { buildFilter } = require('./adminUsers.controller');
const flashy = require('../../services/flashy');
const {
  renderBroadcastHtml,
  personalize,
  personalizePlain,
  fieldsFor,
} = require('../../services/broadcastTemplate');
const { formatEventDate } = require('../../services/eventEmail');
const { sanitizeEmailHtml, htmlToText } = require('../../utils/sanitizeHtml');

// Flashy sends to one recipient per request, so a broadcast is a throttled loop.
// These keep a few hundred sends brisk without hammering the API.
const CONCURRENCY = 4;
const PAUSE_BETWEEN_BATCHES_MS = 150;
const MAX_STORED_FAILURES = 200;
// A run whose document has not moved in this long lost its process (deploy,
// crash); the UI shows it as stalled rather than pretending it is still going.
const STALL_AFTER_MS = 5 * 60 * 1000;

const audienceSchema = z.object({
  type: z.enum(['users', 'event']),
  filters: z.record(z.string()).optional().default({}),
  event: z.string().optional(),
  segment: z.enum(['registered', 'tour', 'slot', 'not_registered']).optional(),
  tourId: z.string().nullable().optional(),
  slotId: z.string().nullable().optional(),
});

const broadcastSchema = z.object({
  subject: z.string().trim().min(2, 'נדרש נושא למייל').max(200),
  bodyHtml: z.string().trim().min(1, 'תוכן ההודעה ריק'),
  audience: audienceSchema,
});

// ── Recipients ──────────────────────────────────────────────────────────

function contextFromUser(user) {
  return {
    email: user.email,
    firstName: user.profile?.firstName || '',
    lastName: user.profile?.lastName || '',
    gedud: user.profile?.gedud || '',
  };
}

const SEGMENT_LABELS = {
  registered: 'כל הנרשמים',
  tour: 'נרשמי הסיורים',
  slot: 'נרשמי שעת סיור',
  not_registered: 'טרם נרשמו',
};

const USER_FILTER_LABELS = {
  q: 'חיפוש',
  organization: 'ארגון',
  isEmailVerified: 'אימות מייל',
  role: 'תפקיד',
  gedud: 'גדוד',
  employmentStatus: 'תעסוקה',
  gender: 'מגדר',
  maritalStatus: 'מצב משפחתי',
  city: 'עיר',
};

function describeUserFilters(filters = {}) {
  const parts = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${USER_FILTER_LABELS[k] || k}: ${v}`);
  return parts.length ? `משתמשים — ${parts.join(', ')}` : 'כל המשתמשים';
}

/**
 * Turns an audience descriptor into the list of people to email.
 * @returns {{recipients: Array<object>, label: string, event?: object}}
 */
async function resolveRecipients(audience) {
  if (audience.type === 'users') {
    const filter = buildFilter(audience.filters || {});
    const users = await User.find(filter).select('email profile').lean();
    return {
      recipients: users.filter((u) => u.email).map(contextFromUser),
      label: describeUserFilters(audience.filters),
    };
  }

  const event = await Event.findById(audience.event);
  if (!event) throw Object.assign(new Error('האירוע לא נמצא'), { status: 404 });

  const eventContext = {
    eventTitle: event.title,
    eventDate: formatEventDate(event.date),
    eventTime: [event.startTime, event.endTime].filter(Boolean).join(' – '),
    eventLocation: event.location || '',
  };

  // Everyone who can see this event: its organization, or all of them.
  const scopeFilter = event.organization ? { organization: event.organization } : {};

  if (audience.segment === 'not_registered') {
    // "Not registered" excludes people who explicitly said they are not coming —
    // a reminder to them would be noise. A cancelled registration still counts
    // as open, since they may re-register.
    const answered = await EventRegistration.find({
      event: event._id,
      status: { $in: ['registered', 'declined'] },
    }).select('user').lean();

    const users = await User.find({
      ...scopeFilter,
      _id: { $nin: answered.map((r) => r.user) },
    })
      .select('email profile')
      .lean();

    return {
      recipients: users.filter((u) => u.email).map((u) => ({ ...contextFromUser(u), ...eventContext })),
      label: `${event.title} — טרם נרשמו`,
      event,
    };
  }

  const regFilter = { event: event._id, status: 'registered' };
  if (audience.segment === 'tour') regFilter.tour = { $ne: null };
  if (audience.segment === 'slot') {
    if (!audience.slotId) throw Object.assign(new Error('יש לבחור שעת סיור'), { status: 400 });
    regFilter['tour.slotId'] = audience.slotId;
  }

  const registrations = await EventRegistration.find(regFilter)
    .populate('user', 'email profile.firstName profile.lastName profile.gedud')
    .lean();

  const recipients = registrations
    .filter((r) => r.user?.email)
    .map((r) => ({
      ...contextFromUser(r.user),
      ...eventContext,
      spouseName: r.hasSpouse ? r.spouseName : '',
      tourTitle: r.tour?.tourTitle || '',
      tourTime: r.tour?.time || '',
    }));

  let label = `${event.title} — ${SEGMENT_LABELS[audience.segment] || 'נרשמים'}`;
  if (audience.segment === 'slot') {
    const time = registrations[0]?.tour?.time;
    // Fall back to the event definition when nobody booked the slot yet.
    const slotTime =
      time ||
      event.tours.flatMap((t) => t.slots).find((s) => String(s._id) === String(audience.slotId))?.time ||
      '';
    label = `${event.title} — סיור ${slotTime}`.trim();
  }

  return { recipients, label, event };
}

// Emails can repeat when a user somehow appears twice; never mail anyone twice.
function dedupe(recipients) {
  const seen = new Set();
  return recipients.filter((r) => {
    const key = String(r.email).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Endpoints ───────────────────────────────────────────────────────────

// Config + credential check, so the UI can explain a missing key up front.
async function status(req, res, next) {
  try {
    const problem = flashy.configError();
    if (problem) return res.json({ configured: false, message: problem });

    if (req.query.verify === 'true') {
      try {
        const account = await flashy.verifyAccount();
        return res.json({
          configured: true,
          verified: true,
          account: account ? { name: account.name, credits: account.credits } : null,
          from: flashy.sender(),
        });
      } catch (err) {
        return res.json({ configured: true, verified: false, message: err.message, from: flashy.sender() });
      }
    }
    res.json({ configured: true, from: flashy.sender() });
  } catch (err) {
    next(err);
  }
}

// Sample context so a preview still shows something when the audience is empty.
const SAMPLE_CONTEXT = {
  email: 'israel@example.com',
  firstName: 'ישראל',
  lastName: 'ישראלי',
  gedud: 'אבישי',
  eventTitle: 'האירוע לדוגמה',
  eventDate: 'יום ראשון, 1 בינואר 2026',
  eventTime: '18:00 – 21:30',
  eventLocation: 'גן לאומי בית שאן',
  spouseName: 'בן/בת הזוג',
  tourTitle: 'סיור לדוגמה',
  tourTime: '16:30',
};

/**
 * How many people this audience covers, a few names to sanity-check it, and —
 * when subject/body are supplied — the rendered email exactly as the first
 * recipient will receive it. Rendering here rather than in the browser keeps
 * one source of truth for the template.
 */
async function preview(req, res, next) {
  try {
    const audience = audienceSchema.parse(req.body.audience || {});
    const { recipients, label } = await resolveRecipients(audience);
    const unique = dedupe(recipients);

    const body = {
      total: unique.length,
      label,
      fields: fieldsFor(audience.type).map(({ key, label: fieldLabel }) => ({ key, label: fieldLabel })),
      sample: unique.slice(0, 8).map((r) => ({
        email: r.email,
        name: [r.firstName, r.lastName].filter(Boolean).join(' '),
      })),
    };

    if (req.body.bodyHtml) {
      const context = unique[0] ? { ...SAMPLE_CONTEXT, ...unique[0] } : SAMPLE_CONTEXT;
      const subject = personalizePlain(req.body.subject || '(ללא נושא)', context);
      body.preview = {
        subject,
        forRecipient: context.email,
        html: renderBroadcastHtml({
          subject,
          bodyHtml: personalize(req.body.bodyHtml, context),
          adminName: req.admin.fullName || req.admin.username,
        }),
      };
    }

    res.json(body);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

// One copy to the signed-in admin, so they can look at it before committing.
async function testSend(req, res, next) {
  try {
    const { subject, bodyHtml, audience } = broadcastSchema.parse(req.body);
    const problem = flashy.configError();
    if (problem) return res.status(400).json({ message: problem });

    const adminName = req.admin.fullName || req.admin.username;
    // Sample values so tokens are visible instead of collapsing to blanks.
    const context = {
      email: req.admin.email,
      firstName: adminName.split(' ')[0] || 'ישראל',
      lastName: adminName.split(' ').slice(1).join(' ') || 'ישראלי',
      gedud: 'אבישי',
      eventTitle: 'האירוע לדוגמה',
      eventDate: 'יום ראשון, 1 בינואר 2026',
      eventTime: '18:00 – 21:30',
      eventLocation: 'גן לאומי בית שאן',
      spouseName: 'בן/בת הזוג',
      tourTitle: 'סיור לדוגמה',
      tourTime: '16:30',
    };

    await flashy.sendEmail({
      to: { name: adminName, email: req.admin.email },
      subject: `[בדיקה] ${personalizePlain(subject, context)}`,
      html: renderBroadcastHtml({
        subject: personalizePlain(subject, context),
        bodyHtml: personalize(bodyHtml, context),
        adminName,
      }),
    });

    res.json({ ok: true, sentTo: req.admin.email, audienceType: audience.type });
  } catch (err) {
    if (err.name === 'FlashyError') return res.status(502).json({ message: err.message });
    next(err);
  }
}

/**
 * Runs the send loop. Detached from the request on purpose: hundreds of
 * sequential API calls would blow past any sane HTTP timeout, so the admin UI
 * polls `getOne` for progress instead.
 */
async function runBroadcast(broadcastId, recipients, { subject, bodyHtml, adminName }) {
  const failures = [];
  let sent = 0;
  let failed = 0;

  await Broadcast.updateOne(
    { _id: broadcastId },
    { $set: { status: 'sending', startedAt: new Date() } }
  );

  for (let i = 0; i < recipients.length; i += CONCURRENCY) {
    const batch = recipients.slice(i, i + CONCURRENCY);

    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      batch.map(async (recipient) => {
        try {
          await flashy.sendEmail({
            to: {
              name: [recipient.firstName, recipient.lastName].filter(Boolean).join(' '),
              email: recipient.email,
            },
            subject: personalizePlain(subject, recipient),
            html: renderBroadcastHtml({
              subject: personalizePlain(subject, recipient),
              bodyHtml: personalize(bodyHtml, recipient),
              adminName,
            }),
          });
          sent += 1;
        } catch (err) {
          failed += 1;
          if (failures.length < MAX_STORED_FAILURES) {
            failures.push({
              email: recipient.email,
              name: [recipient.firstName, recipient.lastName].filter(Boolean).join(' '),
              error: String(err.message || err).slice(0, 300),
            });
          }
        }
      })
    );

    // Persist after every batch so the progress bar reflects reality and a
    // crash leaves an accurate partial record.
    // eslint-disable-next-line no-await-in-loop
    await Broadcast.updateOne({ _id: broadcastId }, { $set: { sent, failed, failures } });

    if (i + CONCURRENCY < recipients.length) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_BATCHES_MS));
    }
  }

  const status =
    failed === 0 ? 'completed' : sent === 0 ? 'failed' : 'completed_with_errors';

  await Broadcast.updateOne(
    { _id: broadcastId },
    { $set: { status, sent, failed, failures, finishedAt: new Date() } }
  );
}

async function create(req, res, next) {
  try {
    const { subject, bodyHtml, audience } = broadcastSchema.parse(req.body);

    const problem = flashy.configError();
    if (problem) return res.status(400).json({ message: problem });

    const cleanBody = sanitizeEmailHtml(bodyHtml);
    if (!htmlToText(cleanBody)) {
      return res.status(400).json({ message: 'תוכן ההודעה ריק' });
    }

    const { recipients, label, event } = await resolveRecipients(audience);
    const unique = dedupe(recipients);
    if (!unique.length) {
      return res.status(400).json({ message: 'אין נמענים התואמים לבחירה' });
    }

    const adminName = req.admin.fullName || req.admin.username;
    const broadcast = await Broadcast.create({
      subject,
      bodyHtml: cleanBody,
      audience: {
        type: audience.type,
        filters: audience.type === 'users' ? audience.filters || {} : {},
        event: event?._id,
        segment: audience.segment,
        tourId: audience.tourId || undefined,
        slotId: audience.slotId || undefined,
        label,
      },
      status: 'queued',
      total: unique.length,
      createdBy: req.admin._id,
      adminName,
    });

    res.status(202).json({ broadcast });

    // Detached on purpose — see runBroadcast.
    runBroadcast(broadcast._id, unique, { subject, bodyHtml: cleanBody, adminName }).catch(async (err) => {
      console.error('Broadcast failed:', err);
      await Broadcast.updateOne(
        { _id: broadcast._id },
        { $set: { status: 'failed', error: String(err.message || err).slice(0, 500), finishedAt: new Date() } }
      ).catch(() => {});
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

function decorate(doc) {
  const obj = doc.toObject ? doc.toObject({ versionKey: false }) : doc;
  obj.isStalled =
    obj.status === 'sending' && Date.now() - new Date(obj.updatedAt).getTime() > STALL_AFTER_MS;
  return obj;
}

async function getOne(req, res, next) {
  try {
    const broadcast = await Broadcast.findById(req.params.id).populate('audience.event', 'title date slug');
    if (!broadcast) return res.status(404).json({ message: 'התפוצה לא נמצאה' });
    res.json({ broadcast: decorate(broadcast) });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { event, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (event) filter['audience.event'] = event;

    const skip = (Number(page) - 1) * Number(limit);
    const [broadcasts, total] = await Promise.all([
      Broadcast.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('audience.event', 'title date slug'),
      Broadcast.countDocuments(filter),
    ]);

    res.json({
      broadcasts: broadcasts.map(decorate),
      hasMore: skip + broadcasts.length < total,
      total,
    });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const broadcast = await Broadcast.findById(req.params.id);
    if (!broadcast) return res.status(404).json({ message: 'התפוצה לא נמצאה' });
    if (broadcast.status === 'sending' || broadcast.status === 'queued') {
      return res.status(409).json({ message: 'לא ניתן למחוק תפוצה שנמצאת בשליחה' });
    }
    await broadcast.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { status, preview, testSend, create, getOne, list, remove, resolveRecipients };
