import {
  baseResumesManagementViewModelSchema,
  type BaseResumesManagementViewModel,
} from '~~/shared/base-resumes/view-model'

export function useBaseResumes() {
  return useFetch<BaseResumesManagementViewModel>('/api/base-resumes', {
    key: 'base-resumes-management',
    transform: (response) =>
      baseResumesManagementViewModelSchema.parse(response),
  })
}
