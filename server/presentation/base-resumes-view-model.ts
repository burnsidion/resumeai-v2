import {
  baseResumesManagementViewModelSchema,
  type BaseResumesManagementViewModel,
} from '../../shared/base-resumes/view-model'
import type { BaseResumesManagementData } from '../../shared/product-data/base-resumes'

const KIBIBYTE_IN_BYTES = 1024
const MEBIBYTE_IN_BYTES = KIBIBYTE_IN_BYTES * 1024

const baseResumeDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
})

const baseResumeSizeFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
})

const countWords = ['Zero', 'One', 'Two', 'Three'] as const

const formatUploadDate = (timestamp: string): string =>
  baseResumeDateFormatter.format(new Date(timestamp))

const formatFileSize = (sizeBytes: number): string => {
  if (sizeBytes < KIBIBYTE_IN_BYTES) {
    return `${sizeBytes} B`
  }

  if (sizeBytes < MEBIBYTE_IN_BYTES) {
    return `${Math.round(sizeBytes / KIBIBYTE_IN_BYTES)} KiB`
  }

  return `${baseResumeSizeFormatter.format(sizeBytes / MEBIBYTE_IN_BYTES)} MiB`
}

const formatCapacityStatus = (remainingSlots: number): string => {
  if (remainingSlots === 0) {
    return 'All active slots are in use'
  }

  const count = countWords[remainingSlots]

  return `${count} ${remainingSlots === 1 ? 'slot' : 'slots'} available`
}

const formatCapacityAriaLabel = (
  activeCount: number,
  activeLimit: number,
): string => {
  if (activeCount === activeLimit) {
    return 'All three active resume slots used'
  }

  return `${countWords[activeCount]} of three active resume slots used`
}

export function createBaseResumesManagementViewModel(
  productData: BaseResumesManagementData,
): BaseResumesManagementViewModel {
  const remainingSlots = productData.activeLimit - productData.activeCount

  return baseResumesManagementViewModelSchema.parse({
    activeCount: productData.activeCount,
    activeCountLabel: `${productData.activeCount} active`,
    activeLimit: productData.activeLimit,
    capacityAriaLabel: formatCapacityAriaLabel(
      productData.activeCount,
      productData.activeLimit,
    ),
    capacityLabel: `${productData.activeCount} of ${productData.activeLimit} resumes`,
    capacityStatusLabel: formatCapacityStatus(remainingSlots),
    items: productData.items.map((resume) => ({
      activeSlot: resume.activeSlot,
      createdAt: resume.createdAt,
      fileSizeLabel: formatFileSize(resume.sizeBytes),
      filename: resume.originalFilename,
      id: resume.id,
      sizeBytes: resume.sizeBytes,
      slotLabel: `Slot ${resume.activeSlot}`,
      statusLabel: 'Active',
      uploadedLabel: `Uploaded ${formatUploadDate(resume.createdAt)}`,
    })),
    remainingSlots,
  })
}
