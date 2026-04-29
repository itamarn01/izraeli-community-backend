require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Organization = require('../models/Organization');
const Benefit = require('../models/Benefit');

async function run() {
  await connectDB();

  const code = 'IZRAELI2025';
  let org = await Organization.findOne({ code });
  if (!org) {
    org = await Organization.create({
      name: 'חטיבת יזרעאלי',
      code,
      description: 'הקהילה הרשמית של חטיבת יזרעאלי',
      isActive: true,
    });
    console.log('Created organization with code:', code);
  } else {
    console.log('Organization already exists:', code);
  }

  const benefitsCount = await Benefit.countDocuments({ organization: org._id });
  if (benefitsCount === 0) {
    await Benefit.insertMany([
      {
        organization: org._id,
        title: 'הנחה ברשת קפה ישראלית',
        description: '15% הנחה על כל התפריט בהצגת תעודת חבר.',
        category: 'אוכל ומשקאות',
        company: 'קפה ישראל',
        discount: '15%',
      },
      {
        organization: org._id,
        title: 'מנוי כושר חצי מחיר',
        description: 'מנוי שנתי במחיר מיוחד לחברי הקהילה.',
        category: 'ספורט וכושר',
        company: 'גוד טיים',
        discount: '50%',
      },
      {
        organization: org._id,
        title: 'ביטוח רכב מוזל',
        description: 'הצעה ייעודית לחברי החטיבה — חסכון של עד 25% בפרמיה השנתית.',
        category: 'פיננסים',
        company: 'מגן ישראלי',
        discount: 'עד 25%',
      },
    ]);
    console.log('Seeded sample benefits');
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
