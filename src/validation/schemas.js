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

const changeEmailSchema = z.object({
  newEmail: z.string().email('כתובת מייל לא תקינה'),
});

const verifyNewEmailSchema = z.object({
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
  }),
  dateOfBirth: z.coerce.date({ errorMap: () => ({ message: 'תאריך לידה לא תקין' }) }),
  gender: z.enum(['male', 'female', 'other']),
  maritalStatus: z.enum(['single', 'married', 'common_law', 'in_relationship', 'divorced', 'other']),
  employmentStatus: z.enum(['employee', 'self_employed', 'combined', 'not_working', 'student']),
  studentLevel: z.enum(['bachelors', 'masters', 'doctorate', 'other']).optional(),
  gedud: z.enum(['משמר העמקים', 'אבישי', 'הכרמל', 'אבשלום', 'חרב שאול'], { required_error: 'נא לבחור גדוד' }),
  children: z.array(childSchema).default([]),
});

const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  phone: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'מספר טלפון לא תקין').optional(),
  address: z
    .object({ city: z.string().trim().min(1), street: z.string().trim().min(1) })
    .optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  maritalStatus: z
    .enum(['single', 'married', 'common_law', 'in_relationship', 'divorced', 'other'])
    .optional(),
  employmentStatus: z.enum(['employee', 'self_employed', 'combined', 'not_working', 'student']).optional(),
  studentLevel: z.enum(['bachelors', 'masters', 'doctorate', 'other']).optional().nullable(),
  gedud: z.enum(['משמר העמקים', 'אבישי', 'הכרמל', 'אבשלום', 'חרב שאול']).optional(),
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
  discountType: z.enum(['percentage', 'price_comparison']).optional(),
  discountPercent: z.number().min(0).max(100).optional().nullable(),
  originalPrice: z.number().min(0).optional().nullable(),
  discountedPrice: z.number().min(0).optional().nullable(),
  whatYouGet: z.string().optional().or(z.literal('')),
  howToRedeem: z.string().optional().or(z.literal('')),
  redemptionLink: z.string().optional().or(z.literal('')),
  redemptionCode: z.string().optional().or(z.literal('')),
  validUntil: z.coerce.date().optional().nullable(),
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
    tiktok: z.string().optional().or(z.literal('')),
  }).optional(),
});

const postSchema = z.object({
  content: z.string().trim().min(1, 'התוכן ריק'),
  imageUrl: z.string().url().optional().or(z.literal('')),
});

const commentSchema = z.object({
  text: z.string().trim().min(1).max(1000),
});

module.exports = {
  orgCodeSchema,
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changeEmailSchema,
  verifyNewEmailSchema,
  questionnaireSchema,
  updateProfileSchema,
  benefitSchema,
  jobSchema,
  postSchema,
  commentSchema,
  socialMediaSchema,
};
