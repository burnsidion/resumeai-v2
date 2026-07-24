import { z } from 'zod'

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .email('Enter a valid email address.')

const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(128, 'Use no more than 128 characters.')

export const signInCredentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

export const signUpCredentialsSchema = z
  .object({
    confirmPassword: z.string(),
    email: emailSchema,
    password: passwordSchema,
  })
  .superRefine(({ confirmPassword, password }, context) => {
    if (confirmPassword !== password) {
      context.addIssue({
        code: 'custom',
        message: 'Passwords must match.',
        path: ['confirmPassword'],
      })
    }
  })

export const authenticationCallbackRequestSchema = z.object({
  code: z.string().trim().min(1).max(4096),
  next: z.string().max(2048).optional(),
})

export type SignInCredentials = z.infer<typeof signInCredentialsSchema>
export type SignUpCredentials = z.infer<typeof signUpCredentialsSchema>
export type AuthenticationCallbackRequest = z.infer<
  typeof authenticationCallbackRequestSchema
>
