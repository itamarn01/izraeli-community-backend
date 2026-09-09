const mongoose = require('mongoose');

// One bookable hour inside a tour, e.g. "16:30" with 25 seats.
// `takenSeats` is kept on the slot itself so a booking can be claimed atomically
// (guarded $inc) instead of counting registrations under a race.
const tourSlotSchema = new mongoose.Schema(
  {
    time: { type: String, required: true, trim: true }, // 'HH:mm'
    capacity: { type: Number, required: true, min: 1, default: 20 },
    takenSeats: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const tourSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    slots: { type: [tourSlotSchema], default: [] },
  },
  { _id: true }
);

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    // Short public identifier used by the shareable landing page (/e/:slug).
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },

    imageUrl: { type: String, default: '' },
    // Rich HTML written by the admin in the RTL editor.
    descriptionHtml: { type: String, default: '' },
    // Plain one-liner used in cards, notifications and emails.
    summary: { type: String, default: '' },

    // Kept as 'YYYY-MM-DD' + 'HH:mm' strings: the event happens at a wall-clock
    // time in Israel, so storing it as a UTC instant only invites offset bugs.
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    startTime: { type: String, default: '' }, // 'HH:mm'
    endTime: { type: String, default: '' }, // 'HH:mm'

    location: { type: String, default: '' },
    locationUrl: { type: String, default: '' },

    // null = visible to every organization.
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },

    // 0 = unlimited. Counts seats, so a member arriving with a spouse takes two.
    capacity: { type: Number, default: 0, min: 0 },
    seatsTaken: { type: Number, default: 0, min: 0 },

    registrationClosesAt: { type: Date, default: null },

    allowSpouse: { type: Boolean, default: true },
    toursEnabled: { type: Boolean, default: false },
    tours: { type: [tourSchema], default: [] },

    // Minimum age (years, as of the event date) for a child to be offered in the popup.
    childrenEnabled: { type: Boolean, default: false },
    childrenMinAge: { type: Number, default: 0, min: 0, max: 120 },

    // Whether the registration popup opens by itself when a member enters the app.
    autoPopup: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

eventSchema.index({ date: 1 });
eventSchema.index({ organization: 1, date: 1 });

// Seats left for the event as a whole (null when unlimited).
eventSchema.methods.seatsLeft = function seatsLeft() {
  if (!this.capacity) return null;
  return Math.max(0, this.capacity - this.seatsTaken);
};

eventSchema.methods.isRegistrationClosed = function isRegistrationClosed() {
  if (this.registrationClosesAt && Date.now() > new Date(this.registrationClosesAt).getTime()) return true;
  // The day after the event the page stops accepting registrations.
  return this.date < new Date().toISOString().slice(0, 10);
};

module.exports = mongoose.model('Event', eventSchema);
