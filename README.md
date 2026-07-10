<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.0-blue?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/Protocol-MTProto%20Fake--TLS-purple?style=for-the-badge" alt="Protocol">
  <img src="https://img.shields.io/badge/Platform-Docker%20%2F%20Railway-orange?style=for-the-badge" alt="Platform">
  <img src="https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge" alt="Status">
</p>

<div align="center">
  <h1>🚀 DX-Proxy Panel</h1>
  <p><strong>پنل مدیریت نسل‌جدید پروکسی MTProto تلگرام</strong></p>
  <p>مدرن • سریع • خودمیزبان • بدون ناهماهنگی</p>

  [![GitHub stars](https://img.shields.io/github/stars/COD-DEXTER/DX-Proxy?style=social)](https://github.com/COD-DEXTER/DX-Proxy/stargazers)
  [![GitHub forks](https://img.shields.io/github/forks/COD-DEXTER/DX-Proxy?style=social)](https://github.com/COD-DEXTER/DX-Proxy/network/members)
</div>

---

## 📖 درباره پروژه

**DX-Proxy** یک سیستم مدیریت اختصاصی، فوق‌العاده مدرن و پرسرعت برای راه‌اندازی و کنترل پروکسی‌های چند سکرتی تلگرام (MTProto) بر پایه‌ی هسته‌ی قدرتمند `mtg-multi` است.

این پنل به گونه‌ای معماری شده که وب‌سایت مدیریتی و منوی ترمینال، هر دو مستقیماً از یک منبع حقیقت واحد (Single Source of Truth) استفاده می‌کنند و هرگونه ناهماهنگی یا تناقض اطلاعاتی بین محیط متنی و پنل وب را کاملاً غیرممکن می‌سازد.

---

## ✨ ویژگی‌های کلیدی

| ویژگی | توضیح |
|---|---|
| 🎨 **طراحی شیشه‌ای مدرن** | تم تاریک لوکس، کارت‌های آماری زنده و افکت‌های نوری پویا (Glassmorphism) |
| ⚡ **تشخیص خودکار متغیرهای Railway** | بدون نیاز به پیکربندی دستی؛ استخراج خودکار دامنه و اطلاعات اتصال |
| 👥 **مدیریت هوشمند کاربران** | ساخت، فعال/غیرفعال‌سازی آنی، تعویض سکرت و حذف کلید به‌همراه تولید QR Code |
| 🔄 **همگام‌سازی ۱۰۰٪** | اجرای هم‌زمان از پنل وب یا خط فرمان داخل کانتینر، بدون هیچ تناقض داده‌ای |
| 🔐 **امنیت بالا** | اجبار به تغییر مشخصات ورود پیش‌فرض در اولین استفاده |

---

## ⚙️ پورت‌ها و پیکربندی شبکه (Railway Network)

برای اجرای صحیح پروژه روی زیرساخت **Railway**، بخش شبکه (Networking) را دقیقاً مطابق جدول زیر تنظیم کنید:

| نوع پورت | پورت داخلی | نوع اتصال در Railway | کاربرد |
|---|---|---|---|
| پروکسی تلگرام | `8080` | TCP Proxy | اتصال کلاینت‌های تلگرام |
| پنل مدیریت وب | `2053` | Public Domain (HTTP) | دسترسی امن HTTPS به داشبورد |

> 💡 برای پورت `8080` یک **TCP Proxy** بسازید تا آدرس و پورت بیرونی اتصال به تلگرام در اختیارتان قرار بگیرد.
> برای پورت `2053` یک **Public Domain** بسازید تا لینک HTTPS امن داشبورد مدیریتی تولید شود.

### 🌍 تغییر ریجن سرور (Scale)

ریجن پیش‌فرض Railway روی **آمریکا (US West)** تنظیمه که برای کاربران ایرانی پینگ بالایی داره. برای بهتر شدن پینگ و سرعت اتصال، حتماً از بخش **Scale** تنظیمات پروژه، ریجن رو به **هلند (Europe West / Netherlands)** تغییر بدید:

> **Settings → Scale → Region → Europe West (Netherlands)**

این کار باعث کاهش محسوس تاخیر (latency) برای کاربرانی می‌شه که از ایران به پروکسی وصل می‌شن.

---

## 💻 دو روش برای مدیریت سیستم

### روش ۱ — پنل وب تحت دامین (Web UI)

با مراجعه به دامنه‌ی تولید‌شده توسط Railway روی پورت `2053`، وارد محیط گرافیکی و مدرن مدیریت شوید.

> مشخصات ورود پیش‌فرض: `admin` / `admin`
> در اولین ورود، پنل شما را ملزم به تغییر فوری این مشخصات می‌کند.

### روش ۲ — خط فرمان کانتینر (CLI)

با ورود به کنسول کانتینر در Railway یا محیط ترمینال داکر، ابزار مدیریتی متنی `dx` را اجرا کنید تا وارد منوی گرافیکی متنی شوید:

```bash
dx
```

یا مستقیماً از دستورات زیر استفاده کنید:

```bash
dx add-user client_name
dx remove-user client_name
dx status
```

---

## 🙏 حمایت مالی و توسعه

اگر این پروژه برایتان کاربردی بوده، می‌توانید با واریز رمزارز از توسعه‌دهنده حمایت کنید:

| شبکه | آدرس کیف پول |
|---|---|
| 🔺 ترون (TRON / TRX) | `TCViL7pRSiEhFBXE2h6jzB4KE5xtcKQ56x` |
| 💎 تون (TON / GRAM) | `UQCAwbc2cibVwOKfgvpuN5zONxfnSfsylIged7XnUykL6OmJ` |
| 🟡 بایننس اسمارت چین (USDT BEP20) | `0xFa204Fe8d2FEBdf7D896F942861A9538382C5668` |

<div align="right">

[⬆ بازگشت به بالا](#-dx-proxy-panel)

</div>