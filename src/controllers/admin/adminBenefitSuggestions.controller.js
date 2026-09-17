const BenefitSuggestion = require('../../models/BenefitSuggestion');
const Benefit = require('../../models/Benefit');
const { benefitSuggestionSchema } = require('../../validation/schemas');
const { createNotification } = require('../../services/notifications');

const POPULATE = [
  { path: 'submittedBy', select: 'email profile.firstName profile.lastName profile.phone' },
  { path: 'organization', select: 'name code' },
];

async function list(req, res, next) {
  try {
    const { status, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    const skip = (Number(page) - 1) * Number(limit);
    const [suggestions, total] = await Promise.all([
      BenefitSuggestion.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate(POPULATE),
      BenefitSuggestion.countDocuments(filter),
    ]);
    res.json({ suggestions, hasMore: skip + suggestions.length < total, total });
  } catch (err) {
    next(err);
  }
}

// Lets the admin fix wording, pricing or the image before publishing — and
// after, in which case the live benefit is updated to match.
async function update(req, res, next) {
  try {
    const data = benefitSuggestionSchema.partial().parse(req.body);
    const suggestion = await BenefitSuggestion.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    }).populate(POPULATE);
    if (!suggestion) return res.status(404).json({ message: 'הצעה לא נמצאה' });

    if (suggestion.publishedBenefit) {
      await Benefit.findByIdAndUpdate(suggestion.publishedBenefit, publishedFields(suggestion));
    }

    res.json({ suggestion });
  } catch (err) {
    next(err);
  }
}

function publishedFields(suggestion) {
  const out = {};
  for (const key of BenefitSuggestion.PUBLISHED_FIELDS) {
    const value = suggestion[key];
    out[key] = value && value.toObject ? value.toObject() : value;
  }
  return out;
}

/**
 * Approving publishes the benefit; there is no second step. Rejecting (or
 * sending an approved one back to pending) pulls it out of the members' list
 * again without deleting it, so the decision stays reversible.
 */
async function updateStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'סטטוס לא תקין' });
    }

    const suggestion = await BenefitSuggestion.findById(req.params.id);
    if (!suggestion) return res.status(404).json({ message: 'הצעה לא נמצאה' });

    let published = null;

    if (status === 'approved') {
      // Suggestions submitted before the form asked for the full benefit have
      // no title to publish under; say so instead of failing on validation.
      if (!suggestion.title?.trim()) {
        return res.status(400).json({
          message: 'ההצעה הוגשה בטופס הישן ואין בה את כל פרטי ההטבה. יש להשלים אותם בעריכה לפני הפרסום.',
        });
      }
      const fields = publishedFields(suggestion);
      if (suggestion.publishedBenefit) {
        // Already has a live entry (a re-approval) — revive it rather than
        // creating a duplicate.
        published = await Benefit.findByIdAndUpdate(
          suggestion.publishedBenefit,
          { ...fields, isHidden: false, isActive: true },
          { new: true }
        );
      }
      if (!published) {
        published = await Benefit.create({ ...fields, organization: suggestion.organization });
        suggestion.publishedBenefit = published._id;

        await createNotification({
          organization: suggestion.organization,
          type: 'benefit',
          title: `הטבה חדשה: ${published.title}`,
          body: published.businessName || published.description?.slice(0, 80) || '',
          resourceId: published._id,
        }).catch(() => {});
      }
    } else if (suggestion.publishedBenefit) {
      // Unpublish, keeping the entry so approving again restores it.
      await Benefit.findByIdAndUpdate(suggestion.publishedBenefit, { isHidden: true });
    }

    suggestion.status = status;
    suggestion.reviewedAt = new Date();
    await suggestion.save();
    await suggestion.populate(POPULATE);

    res.json({ suggestion, benefit: published });
  } catch (err) {
    next(err);
  }
}

// Deleting the suggestion leaves the published benefit alone — it is managed
// from the benefits screen from that point on.
async function remove(req, res, next) {
  try {
    await BenefitSuggestion.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, update, updateStatus, remove };
