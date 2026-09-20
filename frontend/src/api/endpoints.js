export const endpoints = {
  user: {
    info: "/app/user/info",
    update: "/app/user/update",
    login: "/app/user/login/login",
    verifyLoginOtp: "/app/user/login/verify-otp",
    otpStatus: "/app/user/login/otp-status",
    appLogout: "/app/user/info/appLogout",
    updatePassword: "/app/user/info/updatePassword",
    onSell: "/app/user/info/onSell/",
    offSell: "/app/user/info/offSell/",
    updatePin: "/app/user/info/updatePin",
    verifyPin: "/app/user/info/verifyPin",
    register: "/app/user/rs/submit",
    forgot: "/app/user/login/forgot",
    prefill: "/app/user/rs/invite/prefill",
    checkSendOtp: "/app/user/info/checkSendOtp",
    googleLogin: "/app/user/login/google",
    googleComplete: "/app/user/login/google/complete"
  },
  home: {
    notice: "/app/news/notice",
    baseParam: "/app/base/param",
    contentPage: "/app/content/page"
  },
  team: {
    invites: "/app/user/team/invites",
    deleteInvites: "/app/user/team/invites/delete",
    createInvites: "/app/user/team/invites",
    members: "/app/user/team/members",
    teamDetails: "/app/user/team/details",
    editRatio: "/app/user/team/members/ratio",
    getTeamTurnoverBars: "/app/user/team/getTeamTurnoverBars",
    subMembers: "/app/user/team/subMembers"
  },
  point: {
    rechargeConfig: "/app/base/param",
    usdt: "/app/payment/app/buy/order/usdt"
  },
  my: {
    person: "/app/user/info/person",
    personV2: "/app/user/info/personV2",
    getInviterUrl: "/app/user/info/getInviterUrl"
  },
  LinkUpiKycPartner: {
    one: "/app/ct/app/collection/one",
    two: "/app/ct/app/collection/two",
    check: "/app/ct/app/collection/check",
    three: "/app/ct/app/collection/three",
    GetApps: "/apps/GetApps",
    link: "/app/ct/app/collection/link",
    getKycList: "/app/ct/app/collection/getKycList",
    onSell: "/app/user/info/onSell/",
    offSell: "/app/user/info/offSell/",
    available: "/app/ct/app/collection/available",
    allAvailable: "/app/ct/app/collection/allAvailable"
  },
  wallet: {
    getWalletList: "/app/ct/app/collection/getWalletList",
    getPayoutWalletList: "/app/ct/app/collection/getPayoutWalletList",
    submit: "/app/ct/app/collection/submit",
    v2Submit: "/app/ct/app/collection/v2/submit",
    changeStatus: "/app/ct/app/collection/changeStatus/",
    offSell: "/app/ct/app/collection/offSell/",
    sendOtp: "/app/ct/app/collection/sendOtp",
    verifyOtp: "/app/ct/app/collection/verifyOtp"
  },
  ctType: {
    listEnabledCtTypes: "/app/ct/type/listEnabledCtTypes",
    configCheck: "/app/ct/type/configCheck",
    getById: "/app/ct/type/ctType/"
  },
  coverOrder: {
    hangSales: "/app/payment/order",
    readySellTrack: "/app/payment/order/readySellTrack",
    createOrder: "/app/payment/order/create",
    createUsdt: "/app/usdt/order",
    usdtInfo: "/app/usdt/settings",
    usdtHistory: "/app/usdt/order/history",
    usdtOrderDetail: "/app/usdt/order/",
    orderInfo: "/app/payment/order/orderInfo",
    buyHistory: "/app/payment/order/history",
    orderCancel: "/app/payment/order/cancel",
    orderSubmit: "/app/payment/order/submit",
    summary: "/app/payment/order/summary",
    nightBonusStatus: "/app/payment/order/nightBonusStatus",
    carousel: "/app/payment/order/carousel"
  },
  heroCarousel: "/app/hero-carousel",
  pointHistory: "/app/itoken/appi/token/page",
  receive: {
    order: "/app/receive/order/history"
  },
  offlineOrder: {
    pendingBill: "/app/offline/order/page",
    orderCount: "/app/offline/order/count"
  },
  order: {
    detail: "/app/order/info"
  },
  upload: "/app/base/comm/upload",
  uploadBase64: "/app/base/comm/uploadBase64",
  downloadData: "/app/base/comm/download",
  getLatestAppVersion: "/app/app/version/info/getLatestAppVersion",
  getOfficialServiceData: "/app/app/official/service/getOfficialServiceData",
  mission: {
    task: "/app/mission/task",
    receive: "/app/mission/task/receive/"
  },
  active: {
    activeInfo: "/app/user/active/activeInfo"
  },
  userTokenHistory: {
    page: "/app/user/token/page"
  },
  captcha: {
    new: "/app/captcha/new",
    verify: "/app/captcha/verify"
  }
};
