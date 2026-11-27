// Over USB Android only gives the technical package name. This maps common ones to the name people see.
export const APP_NAMES = {
  "com.zhiliaoapp.musically": "TikTok",
  "com.ss.android.ugc.trill": "TikTok",
  "com.facebook.katana": "Facebook",
  "com.facebook.lite": "Facebook Lite",
  "com.facebook.orca": "Messenger",
  "com.instagram.android": "Instagram",
  "jp.naver.line.android": "LINE",
  "com.whatsapp": "WhatsApp",
  "org.telegram.messenger": "Telegram",
  "com.twitter.android": "X (Twitter)",
  "com.google.android.youtube": "YouTube",
  "com.netflix.mediaclient": "Netflix",
  "com.spotify.music": "Spotify",
  "com.lemon.lvoverseas": "CapCut",
  "com.shopee.th": "Shopee",
  "com.lazada.android": "Lazada",
  "com.grabtaxi.passenger": "Grab",
  "th.co.truemoney.wallet": "TrueMoney",
  "com.kasikorn.retail.mbanking.wap": "K PLUS",
  "com.scb.phone": "SCB EASY",
  "com.android.chrome": "Chrome",
  "com.google.android.apps.nbu.files": "Files by Google",
  "com.arlosoft.macrodroid": "MacroDroid",
  "com.android.vending": "Play Store",
  "com.google.android.gms": "Google Play services",
  "com.dts.freefireth": "Free Fire",
  "com.dts.freefiremax": "Free Fire MAX",
  "com.garena.game.kgth": "ROV",
  "com.tencent.ig": "PUBG Mobile",
  "com.mobile.legends": "Mobile Legends",
  "com.roblox.client": "Roblox",
  "com.android.settings": "Settings (ตั้งค่า)",
  "com.android.systemui": "System UI (หน้าจอระบบ)"
};

// Never offer to remove these: removing them can make the device unusable
export const CRITICAL = [
  "android", "com.android.systemui", "com.android.settings", "com.android.phone", "com.android.shell",
  "com.android.providers.settings", "com.android.providers.media", "com.android.providers.downloads",
  "com.android.packageinstaller", "com.google.android.packageinstaller", "com.android.permissioncontroller",
  "com.google.android.permissioncontroller", "com.android.launcher3", "com.android.inputmethod.latin",
  "com.google.android.inputmethod.latin", "com.android.externalstorage", "com.android.documentsui"
];

export function appName(pkg) {
  if (APP_NAMES[pkg]) return APP_NAMES[pkg];
  if (/flash/i.test(pkg)) return "แอป Flash";
  return "";
}
