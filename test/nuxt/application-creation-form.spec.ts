import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ApplicationCreationForm from '~/components/applications/ApplicationCreationForm.vue'
import type { ApplicationCreationState } from '~/composables/useApplicationCreation'
import type { CreateApplicationRequest } from '~~/shared/applications/management'
import type { ApplicationDetailViewModel } from '~~/shared/applications/view-model'
import type { BaseResumeManagementItemViewModel } from '~~/shared/base-resumes/view-model'

const resume: BaseResumeManagementItemViewModel = {
  activeSlot: 1,
  createdAt: '2026-09-01T18:00:00+00:00',
  fileSizeLabel: '482 KiB',
  filename: 'Frontend Engineering.pdf',
  id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
  sizeBytes: 493_568,
  slotLabel: 'Slot 1',
  statusLabel: 'Active',
  uploadedLabel: 'Uploaded September 1, 2026',
}

const idleState: ApplicationCreationState = { status: 'idle' }
const wrappers: VueWrapper[] = []
type ApplicationCreationSubmit = (
  input: CreateApplicationRequest,
) => Promise<ApplicationDetailViewModel | null>

const mountForm = (
  props: Partial<{
    baseResumes: ReadonlyArray<BaseResumeManagementItemViewModel>
    baseResumesStatus: 'error' | 'pending' | 'success'
    creationState: ApplicationCreationState
    submit: ApplicationCreationSubmit
  }> = {},
) =>
  mountSuspended(ApplicationCreationForm, {
    attachTo: document.body,
    props: {
      baseResumes: [resume],
      baseResumesStatus: 'success',
      creationState: idleState,
      submit: vi.fn<ApplicationCreationSubmit>().mockResolvedValue(null),
      ...props,
    },
  }).then((wrapper) => {
    wrappers.push(wrapper)
    return wrapper
  })

const enterRequiredDetails = async (wrapper: VueWrapper): Promise<void> => {
  await wrapper.get('#application-company').setValue('Acme')
  await wrapper.get('#application-role').setValue('Frontend Engineer')
}

describe('application creation form', () => {
  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  it('provides accessible required and optional application fields', async () => {
    const wrapper = await mountForm()

    expect(wrapper.get('label[for="application-company"]').text()).toBe(
      'Company',
    )
    expect(wrapper.get('#application-company').attributes('required')).toBe('')
    expect(wrapper.get('#application-role').attributes('required')).toBe('')
    expect(
      wrapper.get('#application-job-description').attributes('required'),
    ).toBeUndefined()
    expect(wrapper.get('#application-posting-url').attributes('type')).toBe(
      'url',
    )
    expect(
      wrapper.get('#application-notes').attributes('required'),
    ).toBeUndefined()
    expect(wrapper.get('fieldset').text()).toContain('Base resume')
    expect(wrapper.text()).toContain('Saving creates a draft')
  })

  it('summarizes multiple errors and moves focus to the summary', async () => {
    const submit = vi.fn<ApplicationCreationSubmit>()
    const wrapper = await mountForm({ submit })

    await wrapper.get('form').trigger('submit')

    const summary = wrapper.get<HTMLElement>('[role="alert"]')
    expect(summary.text()).toContain('2 details need your attention')
    expect(summary.text()).toContain('Company: Enter a company name.')
    expect(summary.text()).toContain('Role: Enter a role or position title.')
    expect(document.activeElement).toBe(summary.element)
    expect(submit).not.toHaveBeenCalled()
  })

  it('moves focus to a single invalid field', async () => {
    const submit = vi.fn<ApplicationCreationSubmit>()
    const wrapper = await mountForm({ submit })

    await enterRequiredDetails(wrapper)
    await wrapper.get('#application-posting-url').setValue('not-a-url')
    await wrapper.get('form').trigger('submit')

    const postingUrl = wrapper.get<HTMLInputElement>('#application-posting-url')
    expect(postingUrl.attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(postingUrl.element)
    expect(wrapper.text()).toContain('Enter a complete HTTP or HTTPS URL')
    expect(submit).not.toHaveBeenCalled()
  })

  it('submits normalized details while keeping optional fields optional', async () => {
    const submit = vi.fn<ApplicationCreationSubmit>().mockResolvedValue(null)
    const wrapper = await mountForm({ submit })

    await wrapper.get('#application-company').setValue('  Acme  ')
    await wrapper.get('#application-role').setValue('  Frontend Engineer  ')
    await wrapper.get('#application-job-description').setValue('   ')
    await wrapper.get('#application-posting-url').setValue('   ')
    await wrapper.get('#application-notes').setValue('   ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(submit).toHaveBeenCalledWith({
      company: 'Acme',
      jobDescription: null,
      notes: null,
      postingUrl: null,
      role: 'Frontend Engineer',
      selectedBaseResumeId: null,
    })
  })

  it('updates readiness from the current job context and resume selection', async () => {
    const wrapper = await mountForm()

    expect(wrapper.text()).toContain('Save now, prepare later')
    expect(wrapper.text()).toContain('Add a job description')
    expect(wrapper.text()).toContain('Choose a base resume')

    await wrapper
      .get('#application-job-description')
      .setValue('Build an accessible Vue product.')
    await wrapper
      .get<HTMLInputElement>(`input[value="${resume.id}"]`)
      .setValue()

    expect(wrapper.text()).toContain('Ready after saving')
    expect(wrapper.text()).toContain('Job description added')
    expect(wrapper.text()).toContain('Base resume selected')
  })

  it('prevents duplicate submission and disables controls while unresolved', async () => {
    let finishSubmission: () => void = () => undefined
    const submit = vi.fn<ApplicationCreationSubmit>(
      () =>
        new Promise<null>((resolve) => {
          finishSubmission = () => resolve(null)
        }),
    )
    const wrapper = await mountForm({ submit })

    await enterRequiredDetails(wrapper)
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')

    expect(submit).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Creating application…')
    expect(wrapper.get('#application-company').attributes('disabled')).toBe('')
    expect(wrapper.get('fieldset').attributes('disabled')).toBe('')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBe('')

    finishSubmission()
    await flushPromises()
  })

  it('preserves entered values and emits the mapped recovery action after failure', async () => {
    const wrapper = await mountForm()

    await enterRequiredDetails(wrapper)
    await wrapper
      .get('#application-notes')
      .setValue('Ask about accessibility ownership.')
    await wrapper.setProps({
      creationState: {
        failure: {
          code: 'application-save-unavailable',
          message:
            "We couldn't confirm whether the application was created. Check your dashboard before trying again.",
          recovery: 'check-dashboard',
          retryable: false,
        },
        status: 'failure',
      },
    })

    expect(
      wrapper.get<HTMLInputElement>('#application-company').element.value,
    ).toBe('Acme')
    expect(
      wrapper.get<HTMLTextAreaElement>('#application-notes').element.value,
    ).toBe('Ask about accessibility ownership.')
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "We couldn't confirm whether the application was created",
    )
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBe('')

    await wrapper.get('button[type="button"]:last-of-type').trigger('click')

    expect(wrapper.emitted('recovery-requested')).toEqual([['check-dashboard']])
  })

  it('keeps resume-loading failures recoverable and non-blocking', async () => {
    const submit = vi.fn<ApplicationCreationSubmit>().mockResolvedValue(null)
    const wrapper = await mountForm({
      baseResumes: [],
      baseResumesStatus: 'error',
      submit,
    })

    expect(wrapper.get('fieldset [role="alert"]').text()).toContain(
      'You can still save without one',
    )
    await wrapper.get('fieldset button').trigger('click')
    expect(wrapper.emitted('resume-retry-requested')).toHaveLength(1)

    await enterRequiredDetails(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ selectedBaseResumeId: null }),
    )
  })

  it('clears and reports a selected resume that becomes unavailable', async () => {
    const wrapper = await mountForm()

    await wrapper
      .get<HTMLInputElement>(`input[value="${resume.id}"]`)
      .setValue()
    await wrapper.setProps({ baseResumes: [] })
    await flushPromises()

    expect(
      wrapper.get<HTMLInputElement>('input[type="radio"]').element.checked,
    ).toBe(true)
    expect(wrapper.text()).toContain(
      'The selected base resume is no longer available',
    )
  })
})
