import { describe, expect, it } from 'vitest'

import { validateBaseResumeSelection } from '../../app/utils/base-resumes/validate-selection'
import {
  BASE_RESUME_CONTENT_TYPE,
  MAXIMUM_BASE_RESUME_SIZE_BYTES,
} from '../../shared/base-resumes/constraints'

const createFile = (
  body: BlobPart = '%PDF-1.7\n%%EOF',
  options: FilePropertyBag & { name?: string } = {},
): File =>
  new File([body], options.name ?? 'Resume.pdf', {
    type: BASE_RESUME_CONTENT_TYPE,
    ...options,
  })

describe('base resume browser selection validation', () => {
  it('accepts a PDF at the client boundary and normalizes its filename', async () => {
    const file = createFile(undefined, { name: '  Resume.pdf  ' })

    await expect(validateBaseResumeSelection(file)).resolves.toEqual({
      selection: {
        file,
        normalizedFilename: 'Resume.pdf',
      },
      valid: true,
    })
  })

  it.each([
    {
      code: 'invalid-filename',
      file: createFile(undefined, { name: 'folder/resume.pdf' }),
    },
    {
      code: 'unsupported-file-type',
      file: new File(['%PDF-1.7'], 'Resume.pdf', { type: 'text/plain' }),
    },
    {
      code: 'invalid-pdf',
      file: createFile('', { name: 'Empty.pdf' }),
    },
    {
      code: 'invalid-pdf',
      file: createFile('not a PDF', { name: 'Invalid.pdf' }),
    },
  ] as const)('rejects $code without submitting', async ({ code, file }) => {
    await expect(validateBaseResumeSelection(file)).resolves.toEqual({
      code,
      valid: false,
    })
  })

  it('rejects a file above the 10 MiB boundary before reading its signature', async () => {
    let signatureRead = false
    const file = {
      name: 'Large.pdf',
      size: MAXIMUM_BASE_RESUME_SIZE_BYTES + 1,
      slice: () => {
        signatureRead = true
        return new Blob()
      },
      type: BASE_RESUME_CONTENT_TYPE,
    } as File

    await expect(validateBaseResumeSelection(file)).resolves.toEqual({
      code: 'file-too-large',
      valid: false,
    })
    expect(signatureRead).toBe(false)
  })

  it('maps an unreadable local file to a safe validation failure', async () => {
    const file = {
      name: 'Unreadable.pdf',
      size: 5,
      slice: () => ({
        arrayBuffer: () => Promise.reject(new Error('private browser detail')),
      }),
      type: BASE_RESUME_CONTENT_TYPE,
    } as unknown as File

    await expect(validateBaseResumeSelection(file)).resolves.toEqual({
      code: 'invalid-upload',
      valid: false,
    })
  })
})
