# Maher Hero Capital Scanner

إضافة Chrome تعرض أفضل 10 فرص داخل منصة Capital.com، وتستخدم خادم ماهر هيرو للاتصال الآمن بواجهة Capital API.

## تثبيت الإضافة محليًا

1. افتح `chrome://extensions`.
2. فعّل **وضع المطور**.
3. اختر **تحميل إضافة غير محزّمة**.
4. اختر مجلد `capital-extension`.
5. افتح إعدادات الإضافة وأدخل رابط مشروع ماهر هيرو المنشور على Vercel.

## متغيرات Vercel المطلوبة

```env
CAPITAL_API_KEY=...
CAPITAL_IDENTIFIER=...
CAPITAL_API_PASSWORD=...
CAPITAL_BOT_TOKEN=choose-a-long-random-token
CAPITAL_DEMO=true
CAPITAL_TRADING_ENABLED=false
CAPITAL_SYMBOLS=TNDM,ETOR,JLHL,EAH,BBAR,AMWL,GMM,JZXN,IFBD,CCC,OPEN,PYPL
```

ابدأ دائمًا بـ `CAPITAL_DEMO=true` و`CAPITAL_TRADING_ENABLED=false`. لا تحفظ مفاتيح Capital داخل ملفات الإضافة.
