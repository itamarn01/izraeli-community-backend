const mongoose = require('mongoose');

// The tour slot a member holds. Only one slot per member per event — even when
// the admin defined several tours, per the brigade spec.
const tourChoiceSchema = new mongoose.Schema(
  {
    tourId: { type: mongoose.Schema.Types.ObjectId, required: true },
    slotId: { type: mongoose.Schema.Types.ObjectId, required: true },
    tourTitle: { type: String, default: '' }, // snapshot, keeps exports readable
    time: { type: String, default: '' },
    // false = the soldier tours alone even though a spouse comes to the event.
    forBoth: { type: Boolean, default: false },
    seats: { type: Number, default: 1 },
  },
  { _id: false }
);

// Snapshot of a child chosen in the popup — kept even if the profile entry is
// later edited or removed, so past exports stay accurate.
const childAttendeeSchema = new mongoose.Schema(
  {
    childId: { type: mongoose.Schema.Types.ObjectId },
    name: { type: String, trim: true },
    dateOfBirth: { type: Date },
  },
  { _id: false }
);

const eventRegistrationSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Snapshot of the member's organization so exports can segment without a join.
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },

    // 'declined' is stored too, so the auto-popup stops nagging someone who said no.
    status: { type: String, enum: ['registered', 'declined', 'cancelled'], default: 'registered' },

    hasSpouse: { type: Boolean, default: false },
    spouseName: { type: String, default: '', trim: true },

    childrenAttending: { type: [childAttendeeSchema], default: [] },

    tour: { type: tourChoiceSchema, default: null },

    // Seats held for the event itself (1, plus a spouse and/or attending children).
    seats: { type: Number, default: 1 },

    confirmationSentAt: { type: Date },
  },
  { timestamps: true }
);

eventRegistrationSchema.index({ event: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('EventRegistration', eventRegistrationSchema);
