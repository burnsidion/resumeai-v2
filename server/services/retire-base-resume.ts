import {
  retiredBaseResumeSchema,
  type RetiredBaseResume,
} from '../../shared/base-resumes/retirement'
import {
  createBaseResumeRetirementRepository,
  type BaseResumeLifecycleState,
  type BaseResumeRetirementRepository,
} from '../repositories/base-resume-retirement'
import type { ProductDataRepositoryContext } from '../repositories/product-data/context'

export type BaseResumeRetirementServiceErrorKind =
  | 'base-resume-unavailable'
  | 'inconsistent-state'
  | 'persistence-unavailable'
  | 'unexpected-failure'

export interface BaseResumeRetirementServiceDependencies {
  createRepository(
    context: ProductDataRepositoryContext,
  ): BaseResumeRetirementRepository
  now(): Date
}

export class BaseResumeRetirementServiceError extends Error {
  readonly code:
    'base-resume-retirement-unavailable' | 'base-resume-unavailable'

  constructor(
    readonly kind: BaseResumeRetirementServiceErrorKind,
    cause?: unknown,
  ) {
    const unavailable = kind === 'base-resume-unavailable'

    super(
      unavailable
        ? 'The base resume is unavailable.'
        : 'Base resume retirement is temporarily unavailable.',
      { cause },
    )
    this.name = 'BaseResumeRetirementServiceError'
    this.code = unavailable
      ? 'base-resume-unavailable'
      : 'base-resume-retirement-unavailable'
  }
}

const defaultDependencies: BaseResumeRetirementServiceDependencies = {
  createRepository: createBaseResumeRetirementRepository,
  now: () => new Date(),
}

const createServiceError = (
  kind: BaseResumeRetirementServiceErrorKind,
  cause?: unknown,
): BaseResumeRetirementServiceError =>
  new BaseResumeRetirementServiceError(kind, cause)

const toRetiredBaseResume = (
  state: BaseResumeLifecycleState,
  expectedId: string,
): RetiredBaseResume => {
  if (state.state !== 'retired' || state.id !== expectedId) {
    throw createServiceError('inconsistent-state')
  }

  try {
    return retiredBaseResumeSchema.parse({
      id: state.id,
      retiredAt: state.retiredAt,
    })
  } catch (error) {
    throw createServiceError('inconsistent-state', error)
  }
}

const validateRetirementResult = (
  retired: RetiredBaseResume,
  expectedId: string,
  expectedRetiredAt: string,
): RetiredBaseResume => {
  let parsed: RetiredBaseResume

  try {
    parsed = retiredBaseResumeSchema.parse(retired)
  } catch (error) {
    throw createServiceError('inconsistent-state', error)
  }

  if (
    parsed.id !== expectedId ||
    Date.parse(parsed.retiredAt) !== Date.parse(expectedRetiredAt)
  ) {
    throw createServiceError('inconsistent-state')
  }

  return parsed
}

const readLifecycleForReconciliation = async (
  repository: BaseResumeRetirementRepository,
  id: string,
  originalFailure?: unknown,
): Promise<BaseResumeLifecycleState | null> => {
  try {
    return await repository.findLifecycleById(id)
  } catch (reconciliationFailure) {
    throw createServiceError('persistence-unavailable', {
      originalFailure,
      reconciliationFailure,
    })
  }
}

const reconcileEmptyRetirement = async (
  repository: BaseResumeRetirementRepository,
  id: string,
): Promise<RetiredBaseResume> => {
  const lifecycle = await readLifecycleForReconciliation(repository, id)

  if (lifecycle === null) {
    throw createServiceError('base-resume-unavailable')
  }

  if (lifecycle.state === 'active') {
    throw createServiceError('inconsistent-state')
  }

  return toRetiredBaseResume(lifecycle, id)
}

const reconcileRetirementFailure = async (
  repository: BaseResumeRetirementRepository,
  id: string,
  retirementFailure: unknown,
): Promise<RetiredBaseResume> => {
  const lifecycle = await readLifecycleForReconciliation(
    repository,
    id,
    retirementFailure,
  )

  if (lifecycle?.state === 'retired') {
    return toRetiredBaseResume(lifecycle, id)
  }

  throw createServiceError('persistence-unavailable', retirementFailure)
}

export async function retireBaseResume(
  context: ProductDataRepositoryContext,
  id: string,
  dependencies: BaseResumeRetirementServiceDependencies = defaultDependencies,
): Promise<RetiredBaseResume> {
  let repository: BaseResumeRetirementRepository
  let retiredAt: string

  try {
    repository = dependencies.createRepository(context)
    retiredAt = dependencies.now().toISOString()
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }

  let retired: RetiredBaseResume | null

  try {
    retired = await repository.retire(id, retiredAt)
  } catch (retirementFailure) {
    return reconcileRetirementFailure(repository, id, retirementFailure)
  }

  if (retired === null) {
    return reconcileEmptyRetirement(repository, id)
  }

  return validateRetirementResult(retired, id, retiredAt)
}
