import { createRouter, createWebHashHistory } from 'vue-router'
import { auth } from '../api/auth'

import Login from '../pages/Login.vue'
import Register from '../pages/Register.vue'
import ForgotPassword from '../pages/ForgotPassword.vue'
import Home from '../pages/Home.vue'
import Deposit from '../pages/Deposit.vue'
import TaskRewards from '../pages/TaskRewards.vue'
import Payment from '../pages/Payment.vue'
import PaymentHistory from '../pages/PaymentHistory.vue'
import Orders from '../pages/Orders.vue'
import BuyOrders from '../pages/BuyOrders.vue'
import SellOrders from '../pages/SellOrders.vue'
import OrderDetail from '../pages/OrderDetail.vue'
import UsdtOrder from '../pages/UsdtOrder.vue'
import Wallet from '../pages/Wallet.vue'
import AddWallet from '../pages/AddWallet.vue'
import Team from '../pages/Team.vue'
import TeamLevel from '../pages/TeamLevel.vue'
import Statistics from '../pages/Statistics.vue'
import MyAsset from '../pages/MyAsset.vue'
import Score from '../pages/Score.vue'
import Service from '../pages/Service.vue'
import PinCode from '../pages/PinCode.vue'
import Message from '../pages/Message.vue'
import PrivacyPolicy from '../pages/PrivacyPolicy.vue'

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', name: 'Login', component: Login, meta: { hideTabBar: true } },
  { path: '/register', name: 'Register', component: Register, meta: { hideTabBar: true } },
  { path: '/forgot-password', name: 'ForgotPassword', component: ForgotPassword, meta: { hideTabBar: true } },
  { path: '/home', name: 'Home', component: Home },
  { path: '/deposit', name: 'Deposit', component: Deposit, meta: { hideTabBar: true } },
  { path: '/task-rewards', name: 'TaskRewards', component: TaskRewards, meta: { hideTabBar: true } },
  { path: '/payment', name: 'Payment', component: Payment },
  { path: '/payment-history', name: 'PaymentHistory', component: PaymentHistory, meta: { hideTabBar: true } },
  { path: '/orders', name: 'Orders', component: Orders, meta: { hideTabBar: true } },
  { path: '/buy-orders', name: 'BuyOrders', component: BuyOrders, meta: { hideTabBar: true } },
  { path: '/sell-orders', name: 'SellOrders', component: SellOrders, meta: { hideTabBar: true } },
  { path: '/order-detail/:id?', name: 'OrderDetail', component: OrderDetail, meta: { hideTabBar: true } },
  { path: '/usdt-order/:id', name: 'UsdtOrder', component: UsdtOrder, meta: { hideTabBar: true } },
  { path: '/wallet', name: 'Wallet', component: Wallet },
  { path: '/add-wallet', name: 'AddWallet', component: AddWallet, meta: { hideTabBar: true } },
  { path: '/team', name: 'Team', component: Team, meta: { hideTabBar: true } },
  { path: '/team-level', name: 'TeamLevel', component: TeamLevel, meta: { hideTabBar: true } },
  { path: '/statistics', name: 'Statistics', component: Statistics },
  { path: '/my', name: 'MyAsset', component: MyAsset },
  { path: '/score', name: 'Score', component: Score, meta: { hideTabBar: true } },
  { path: '/service', name: 'Service', component: Service, meta: { hideTabBar: true } },
  { path: '/pin-code', name: 'PinCode', component: PinCode, meta: { hideTabBar: true } },
  { path: '/message', name: 'Message', component: Message, meta: { hideTabBar: true } },
  { path: '/privacy-policy', name: 'PrivacyPolicy', component: PrivacyPolicy, meta: { hideTabBar: true } },
  { path: '/register/:inviteCode([A-Za-z0-9]{4,20})', name: 'RegisterWithCode', component: Register, meta: { hideTabBar: true } },
  {
    path: '/users_invite_code/:inviteCode([A-Za-z0-9]{3,32})',
    name: 'PublicInviteEntry',
    redirect: to => ({ name: 'Register', query: { invite: String(to.params.inviteCode || '') } }),
    meta: { hideTabBar: true }
  },
  {
    path: '/:inviteCode([A-Za-z0-9]{4,20})',
    name: 'InviteEntry',
    redirect: to => ({ name: 'Login', query: { invite: String(to.params.inviteCode || '') } }),
    meta: { hideTabBar: true }
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

const publicRoutes = ['Login', 'Register', 'RegisterWithCode', 'PublicInviteEntry', 'InviteEntry', 'ForgotPassword', 'PrivacyPolicy'];

router.beforeEach((to, from, next) => {
  const hasToken = auth.getToken();
  if (!hasToken && !publicRoutes.includes(to.name)) {
    next({ name: 'Login' });
  } else if (hasToken && to.name === 'Login') {
    next({ name: 'Home' });
  } else {
    next();
  }
});

export default router
