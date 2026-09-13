import {
  applicationListViewModelSchema,
  type ApplicationListViewModel,
} from '~~/shared/applications/view-model'

export function useApplications() {
  return useFetch<ApplicationListViewModel>('/api/applications', {
    key: 'applications-list',
    transform: (response) => applicationListViewModelSchema.parse(response),
  })
}
