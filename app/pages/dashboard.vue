<script setup lang="ts">
import { dashboardMockData } from '~/data/dashboard'

definePageMeta({
  layout: 'authenticated',
  middleware: 'authenticated',
})

useHead({
  title: 'Dashboard · ResumAI',
})

const dashboard = dashboardMockData
</script>

<template>
  <main class="min-h-dvh px-5 py-8 sm:px-8 xl:px-12 xl:py-10">
    <DashboardHeader :summary="dashboard.summary" />

    <div
      class="mt-10 grid items-stretch gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,1fr)]"
    >
      <DashboardReadyForReview :item="dashboard.readyForReview" />
      <DashboardQuickActions :actions="dashboard.quickActions" />
      <DashboardRecentApplications
        :applications="dashboard.recentApplications"
        :follow-up="dashboard.followUp"
      />
      <DashboardBaseResumes :resumes="dashboard.baseResumes" />
    </div>
  </main>
</template>
