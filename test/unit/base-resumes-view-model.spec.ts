import { describe, expect, it } from 'vitest'

import { baseResumesManagementViewModelSchema } from '../../shared/base-resumes/view-model'
import type { BaseResumesManagementData } from '../../shared/product-data/base-resumes'
import { createBaseResumesManagementViewModel } from '../../server/presentation/base-resumes-view-model'

const createProductData = (
  overrides: Partial<BaseResumesManagementData> = {},
): BaseResumesManagementData => ({
  activeCount: 2,
  activeLimit: 3,
  items: [
    {
      activeSlot: 1,
      createdAt: '2026-08-08T18:00:00+00:00',
      id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
      originalFilename: 'Frontend Engineering.pdf',
      sizeBytes: 493_568,
    },
    {
      activeSlot: 2,
      createdAt: '2026-08-02T18:00:00+00:00',
      id: '2d1f2ca0-a46e-42df-99c9-5a362f291a46',
      originalFilename: 'Accessibility Specialist.pdf',
      sizeBytes: 629_760,
    },
  ],
  ...overrides,
})

describe('Base Resumes presentation mapper', () => {
  it('maps the approved partial-capacity data without exposing infrastructure fields', () => {
    const viewModel = createBaseResumesManagementViewModel(createProductData())

    expect(baseResumesManagementViewModelSchema.parse(viewModel)).toEqual(
      viewModel,
    )
    expect(viewModel).toMatchObject({
      activeCount: 2,
      activeCountLabel: '2 active',
      activeLimit: 3,
      capacityAriaLabel: 'Two of three active resume slots used',
      capacityLabel: '2 of 3 resumes',
      capacityStatusLabel: 'One slot available',
      remainingSlots: 1,
    })
    expect(viewModel.items[0]).toEqual({
      activeSlot: 1,
      createdAt: '2026-08-08T18:00:00+00:00',
      fileSizeLabel: '482 KiB',
      filename: 'Frontend Engineering.pdf',
      id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
      sizeBytes: 493_568,
      slotLabel: 'Slot 1',
      statusLabel: 'Active',
      uploadedLabel: 'Uploaded August 8, 2026',
    })
    expect(viewModel.items[0]).not.toHaveProperty('storageObjectKey')
    expect(viewModel.items[0]).not.toHaveProperty('userId')
  })

  it('maps the zero state to available capacity rather than an error', () => {
    const viewModel = createBaseResumesManagementViewModel(
      createProductData({
        activeCount: 0,
        items: [],
      }),
    )

    expect(viewModel).toEqual({
      activeCount: 0,
      activeCountLabel: '0 active',
      activeLimit: 3,
      capacityAriaLabel: 'Zero of three active resume slots used',
      capacityLabel: '0 of 3 resumes',
      capacityStatusLabel: 'Three slots available',
      items: [],
      remainingSlots: 3,
    })
  })

  it('maps full capacity without implying another available upload slot', () => {
    const productData = createProductData({
      activeCount: 3,
      items: [
        ...createProductData().items,
        {
          activeSlot: 3,
          createdAt: '2026-07-27T18:00:00+00:00',
          id: '7077c821-56ad-4a0a-921f-68a1020a5652',
          originalFilename: 'Product Engineering.pdf',
          sizeBytes: 540_672,
        },
      ],
    })
    const viewModel = createBaseResumesManagementViewModel(productData)

    expect(viewModel).toMatchObject({
      activeCount: 3,
      activeCountLabel: '3 active',
      capacityAriaLabel: 'All three active resume slots used',
      capacityLabel: '3 of 3 resumes',
      capacityStatusLabel: 'All active slots are in use',
      remainingSlots: 0,
    })
  })

  it('formats byte, kibibyte, and mebibyte values deterministically', () => {
    const productData = createProductData({
      activeCount: 3,
      items: [
        {
          activeSlot: 1,
          createdAt: '2026-08-08T18:00:00+00:00',
          id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
          originalFilename: 'Small.pdf',
          sizeBytes: 512,
        },
        {
          activeSlot: 2,
          createdAt: '2026-08-02T18:00:00+00:00',
          id: '2d1f2ca0-a46e-42df-99c9-5a362f291a46',
          originalFilename: 'Medium.pdf',
          sizeBytes: 1_536,
        },
        {
          activeSlot: 3,
          createdAt: '2026-07-27T18:00:00+00:00',
          id: '7077c821-56ad-4a0a-921f-68a1020a5652',
          originalFilename: 'Large.pdf',
          sizeBytes: 1_572_864,
        },
      ],
    })

    expect(
      createBaseResumesManagementViewModel(productData).items.map(
        ({ fileSizeLabel }) => fileSizeLabel,
      ),
    ).toEqual(['512 B', '2 KiB', '1.5 MiB'])
  })

  it('formats upload dates in UTC', () => {
    const productData = createProductData({
      activeCount: 1,
      items: [
        {
          activeSlot: 1,
          createdAt: '2026-08-08T23:30:00-06:00',
          id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
          originalFilename: 'Frontend Engineering.pdf',
          sizeBytes: 493_568,
        },
      ],
    })

    expect(
      createBaseResumesManagementViewModel(productData).items[0]?.uploadedLabel,
    ).toBe('Uploaded August 9, 2026')
  })

  it('rejects non-deterministically ordered response items', () => {
    const viewModel = createBaseResumesManagementViewModel(createProductData())
    const result = baseResumesManagementViewModelSchema.safeParse({
      ...viewModel,
      items: [...viewModel.items].reverse(),
    })

    expect(result.success).toBe(false)
  })
})
