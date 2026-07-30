import {
  dashboardViewModelSchema,
  type DashboardViewModel,
} from '~~/shared/dashboard/view-model'

export function useDashboard() {
  return useFetch<DashboardViewModel>('/api/dashboard', {
    key: 'dashboard',
    transform: (response) => dashboardViewModelSchema.parse(response),
  })
}
