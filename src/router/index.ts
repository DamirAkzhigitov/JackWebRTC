import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: () => import('@/layouts/default/Default.vue'),
    children: [
      {
        path: '/home',
        name: 'Home',
        component: () =>
          import(/* webpackChunkName: "home" */ '@/views/Home.vue')
      },
      {
        path: '/test-api-calls',
        name: 'TestApiCalls',
        component: () =>
          import(/* webpackChunkName: "home" */ '@/views/TestApiPage.vue')
      },
      {
        path: '/trading-page',
        name: 'TradingPage',
        component: () =>
          import(/* webpackChunkName: "home" */ '@/views/TradingPage.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

export default router
