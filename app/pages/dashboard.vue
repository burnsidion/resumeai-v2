<script setup lang="ts">
definePageMeta({
  layout: 'authenticated',
  middleware: 'authenticated',
})

useHead({
  title: 'Dashboard · ResumAI',
})

const { data: dashboard, status } = useDashboard()
</script>

<template>
  <main class="min-h-dvh px-5 py-8 sm:px-8 xl:px-12 xl:py-10">
    <template v-if="dashboard">
      <DashboardHeader :summary="dashboard.summary" />

      <div
        class="mt-10 grid items-stretch gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,1fr)]"
      >
        <DashboardReadyForReview :item="dashboard.attention" />
        <DashboardQuickActions :actions="dashboard.quickActions" />
        <DashboardRecentApplications
          :applications="dashboard.recentApplications"
        />
        <DashboardBaseResumes :resumes="dashboard.baseResumes" />
      </div>
    </template>

    <section
      v-else-if="status === 'error'"
      class="bg-surface border-line mx-auto max-w-2xl rounded-2xl border p-8"
      role="alert"
      aria-labelledby="dashboard-error-heading"
    >
      <h1
        id="dashboard-error-heading"
        class="text-2xl font-semibold tracking-[-0.03em]"
      >
        Dashboard unavailable
      </h1>
      <p class="text-muted mt-3 leading-7">
        Your dashboard could not be loaded right now.
      </p>
    </section>

    <section
      v-else
      class="bg-surface border-line mx-auto max-w-2xl rounded-2xl border p-8"
      aria-live="polite"
      aria-busy="true"
    >
      <h1 class="text-2xl font-semibold tracking-[-0.03em]">
        Loading your dashboard
      </h1>
      <p class="text-muted mt-3 leading-7">
        Your workspace will be ready shortly.
      </p>
    </section>
  </main>
</template>
