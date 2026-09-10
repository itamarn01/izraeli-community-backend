const { z } = require('zod');

const orgCodeSchema = z.object({
  code: z.string().trim().min(3, 'קוד הארגון קצר מדי').max(40),
});

const registerSchema = z.object({
  email: z.string().email('כתובת מייל לא תקינה'),
  password: z.string().min(8, 'סיסמה חייבת להכיל לפחות 8 תווים'),
  organizationCode: z.string().trim().min(3, 'קוד ארגון חסר'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, 'קוד לא תקין'),
});

const resendOtpSchema = z.object({
  email: z.string().email(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('כתובת מייל לא תקינה'),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, 'קוד לא תקין'),
  newPassword: z.string().min(8, 'סיסמה חייבת להכיל לפחות 8 תווים'),
});

const loginOtpRequestSchema = z.object({
  email: z.string().email('כתובת מייל לא תקינה'),
});

const loginOtpVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, 'קוד לא תקין'),
});

const changeEmailSchema = z.object({
  newEmail: z.string().email('כתובת מייל לא תקינה'),
});

const verifyNewEmailSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'קוד לא תקין'),
});

const spouseEmailRequestSchema = z.object({
  spouseName: z.string().trim().min(2, 'נדרש שם בן/בת הזוג'),
  spouseEmail: z.string().trim().email('כתובת מייל לא תקינה'),
});

const spouseEmailVerifySchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'קוד לא תקין'),
});

const childSchema = z.object({
  name: z.string().trim().min(1, 'נדרש שם הילד/ה'),
  dateOfBirth: z.coerce.date({ errorMap: () => ({ message: 'תאריך לידה לא תקין' }) }),
});

const questionnaireSchema = z.object({
  firstName: z.string().trim().min(1, 'נדרש שם פרטי'),
  lastName: z.string().trim().min(1, 'נדרש שם משפחה'),
  phone: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'מספר טלפון לא תקין'),
  address: z.object({
    city: z.string().trim().min(1, 'נדרשת עיר'),
    street: z.string().trim().min(1, 'נדרש רחוב'),
    houseNumber: z.string().trim().optional().or(z.literal('')),
    apartment: z.string().trim().optional().or(z.literal('')),
  }),
  dateOfBirth: z.coerce.date({ errorMap: () => ({ message: 'תאריך לידה לא תקין' }) }),
  gender: z.enum(['male', 'female', 'other']),
  maritalStatus: z.enum(['single', 'married', 'common_law', 'in_relationship', 'divorced', 'other']),
  employmentStatus: z.enum(['employee', 'self_employed', 'combined', 'not_working', 'student']).optional(),
  employmentStatuses: z.array(z.enum(['employee', 'self_employed', 'not_working', 'student'])).optional(),
  studentLevel: z.enum(['bachelors', 'masters', 'doctorate', 'other']).optional(),
  selfEmployedBusiness: z.string().trim().optional().or(z.literal('')),
  gedud: z.enum(['משמר העמקים', 'אבישי', 'הכרמל', 'אבשלום', 'חרב שאול', 'מטה'], { required_error: 'נא לבחור גדוד' }),
  children: z.array(childSchema).default([]),
});

const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  phone: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'מספר טלפון לא תקין').optional(),
  address: z
    .object({
      city: z.string().trim().min(1),
      street: z.string().trim().min(1),
      houseNumber: z.string().trim().optional().or(z.literal('')),
      apartment: z.string().trim().optional().or(z.literal('')),
    })
    .optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  maritalStatus: z
    .enum(['single', 'married', 'common_law', 'in_relationship', 'divorced', 'other'])
    .optional(),
  employmentStatus: z.enum(['employee', 'self_employed', 'combined', 'not_working', 'student']).optional(),
  employmentStatuses: z.array(z.enum(['employee', 'self_employed', 'not_working', 'student'])).optional(),
  studentLevel: z.enum(['bachelors', 'masters', 'doctorate', 'other']).optional().nullable(),
  selfEmployedBusiness: z.string().trim().optional().or(z.literal('')),
  gedud: z.enum(['משמר העמקים', 'אבישי', 'הכרמל', 'אבשלום', 'חרב שאול', 'מטה']).optional(),
  children: z.array(childSchema).optional(),
});

const socialMediaSchema = z.object({
  facebook: z.string().optional().or(z.literal('')),
  instagram: z.string().optional().or(z.literal('')),
  whatsapp: z.string().optional().or(z.literal('')),
  tiktok: z.string().optional().or(z.literal('')),
}).optional();

const benefitSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().min(2),
  category: z.string().optional(),
  businessName: z.string().optional().or(z.literal('')),
  website: z.string().optional().or(z.literal('')),
  socialMedia: socialMediaSchema,
  imageUrl: z.string().url().optional().or(z.literal('')),
  discountType: z.enum(['percentage', 'price_comparison', 'gift_with_purchase']).optional(),
  discountPercent: z.number().min(0).max(100).optional().nullable(),
  originalPrice: z.number().min(0).optional().nullable(),
  discountedPrice: z.number().min(0).optional().nullable(),
  whatYouGet: z.string().optional().or(z.literal('')),
  howToRedeem: z.string().optional().or(z.literal('')),
  redemptionLink: z.string().optional().or(z.literal('')),
  redemptionCode: z.string().optional().or(z.literal('')),
  validUntil: z.coerce.date().optional().nullable(),
  gedud: z.enum(['משמר העמקים', 'אבישי', 'הכרמל', 'אבשלום', 'חרב שאול', 'מטה', 'שותף לדרך']).optional().or(z.literal('')),
});

const jobSchema = z.object({
  title: z.string().trim().min(2),
  company: z.string().trim().min(2),
  location: z.string().optional(),
  type: z.enum(['full_time', 'part_time', 'freelance', 'internship', 'temporary']).default('full_time'),
  category: z.string().optional(),
  description: z.string().trim().min(2),
  requirements: z.array(z.string()).default([]),
  salaryRange: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  imageUrl: z.string().url().optional().or(z.literal('')),
  website: z.string().optional().or(z.literal('')),
  socialMedia: z.object({
    facebook: z.string().optional().or(z.literal('')),
    instagram: z.string().optional().or(z.literal('')),
    whatsapp: z.string().optional().or(z.literal('')),
    linkedin: z.string().optional().or(z.literal('')),
  }).optional(),
});

const formFieldInputSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1, 'נדרשת תווית לשדה'),
  type: z.enum(['text', 'date', 'select']).default('text'),
  required: z.boolean().optional().default(false),
  placeholder: z.string().optional().or(z.literal('')),
  options: z.array(z.string()).optional().default([]),
});

const formInputSchema = z.object({
  title: z.string().trim().min(2, 'נדרשת כותרת'),
  description: z.string().optional().or(z.literal('')),
  bodyHtml: z.string().optional().or(z.literal('')),
  fields: z.array(formFieldInputSchema).optional().default([]),
  fieldSeq: z.number().optional(),
  requireUserSignature: z.boolean().optional(),
  signatureLabel: z.string().optional().or(z.literal('')),
  adminSignatureUrl: z.string().optional().or(z.literal('')),
  adminSignatureLabel: z.string().optional().or(z.literal('')),
  isPublished: z.boolean().optional(),
  theme: z.enum(['official', 'modern', 'classic']).optional().default('official'),
  colorKey: z.enum(['olive', 'blue', 'bordeaux', 'charcoal', 'forest']).optional().default('olive'),
});

const postSchema = z.object({
  content: z.string().trim().min(1, 'התוכן ריק'),
  imageUrl: z.string().url().optional().or(z.literal('')),
});

const commentSchema = z.object({
  text: z.string().trim().min(1).max(1000),
});

// ── Events ──────────────────────────────────────────────────────────────
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const eventTourSlotSchema = z.object({
  _id: z.string().optional(),
  time: z.string().regex(TIME_RE, 'שעה לא תקינה (HH:MM)'),
  capacity: z.coerce.number().int().min(1, 'לפחות מקום אחד').max(10000),
  takenSeats: z.coerce.number().int().min(0).optional(),
});

const eventTourSchema = z.object({
  _id: z.string().optional(),
  title: z.string().trim().min(2, 'נדרשת כותרת לסיור'),
  description: z.string().optional().or(z.literal('')),
  slots: z.array(eventTourSlotSchema).default([]),
});

const eventInputSchema = z.object({
  title: z.string().trim().min(2, 'נדרשת כותרת לאירוע'),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9֐-׿-]+$/i, 'הכתובת יכולה להכיל אותיות, ספרות ומקפים בלבד')
    .optional()
    .or(z.literal('')),
  imageUrl: z.string().optional().or(z.literal('')),
  descriptionHtml: z.string().optional().or(z.literal('')),
  summary: z.string().max(300).optional().or(z.literal('')),

  date: z.string().regex(DATE_RE, 'נדרש תאריך לאירוע'),
  startTime: z.string().regex(TIME_RE, 'שעה לא תקינה').optional().or(z.literal('')),
  endTime: z.string().regex(TIME_RE, 'שעה לא תקינה').optional().or(z.literal('')),

  location: z.string().optional().or(z.literal('')),
  locationUrl: z.string().optional().or(z.literal('')),

  capacity: z.coerce.number().int().min(0).default(0),
  registrationClosesAt: z.coerce.date().nullable().optional(),

  allowSpouse: z.boolean().optional(),
  toursEnabled: z.boolean().optional(),
  tours: z.array(eventTourSchema).default([]),
  autoPopup: z.boolean().optional(),

  childrenEnabled: z.boolean().optional(),
  childrenMinAge: z.coerce.number().int().min(0).max(120).default(0),
});

// What a member sends from the registration popup.
const eventRegistrationSchema = z
  .object({
    hasSpouse: z.boolean().default(false),
    spouseName: z.string().trim().max(120).optional().or(z.literal('')),
    childrenIds: z.array(z.string()).default([]),
    tourId: z.string().nullable().optional(),
    slotId: z.string().nullable().optional(),
    // Whether the tour seat covers the spouse too.
    tourForBoth: z.boolean().default(false),
  })
  .refine((d) => !d.hasSpouse || (d.spouseName && d.spouseName.trim().length >= 2), {
    message: 'נדרש שם בן/בת הזוג',
    path: ['spouseName'],
  })
  .refine((d) => (!d.tourId && !d.slotId) || (d.tourId && d.slotId), {
    message: 'יש לבחור שעה לסיור',
    path: ['slotId'],
  });

module.exports = {
  orgCodeSchema,
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginOtpRequestSchema,
  loginOtpVerifySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changeEmailSchema,
  verifyNewEmailSchema,
  spouseEmailRequestSchema,
  spouseEmailVerifySchema,
  questionnaireSchema,
  updateProfileSchema,
  benefitSchema,
  jobSchema,
  postSchema,
  commentSchema,
  socialMediaSchema,
  formInputSchema,
  eventInputSchema,
  eventRegistrationSchema,
};
