const BenefitSuggestion = require('../../models/BenefitSuggestion');

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
        .populate('submittedBy', 'email profile.firstName profile.lastName profile.phone')
        .populate('organization', 'name code'),
      BenefitSuggestion.countDocuments(filter),
    ]);
    res.json({ suggestions, hasMore: skip + suggestions.length < total, total });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'סטטוס לא תקין' });
    }
    const suggestion = await BenefitSuggestion.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!suggestion) return res.status(404).json({ message: 'הצעה לא נמצאה' });
    res.json({ suggestion });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await BenefitSuggestion.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, updateStatus, remove };
