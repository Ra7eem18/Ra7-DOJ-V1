# ⚖️ Ra7-DOJ V1

A free and advanced **Department of Justice / Ministry of Justice system** for FiveM servers, developed by **Ra7 Dev**.

Designed specifically for **QBCore**, with a modern user interface and a complete case management system for judges, prosecutors, lawyers, and authorized police personnel.

---

## ✨ Features

- ⚖️ Complete Ministry of Justice system
- 📁 Advanced case management
- 👨‍⚖️ Judge system
- 👨‍💼 Prosecutor system
- 💼 Lawyer system
- 👮 Optional Police Prosecutor support
- 🔎 Citizen search
- 📋 Citizen records
- 📝 Case notes
- 📎 Evidence management
- 🖼️ Image evidence support
- ⚖️ Verdict management
- 📩 Case claim/request system
- 🔔 Notification system
- 📜 Audit logs
- 📄 PDF export support
- 🌐 Arabic & English UI
- 🎯 Supports `ox_target` and `qb-target`
- 🔐 Role-based permissions
- ⚙️ Highly configurable
- 🧹 Automatic database maintenance
- 📱 DOJ Tablet Item
- 🖥️ Ministry of Justice Kiosk

---

## 📦 Requirements

Make sure the following resources are installed and started:

- `qb-core`
- `oxmysql`
- `ox_lib`
- `ox_target` **or** `qb-target`

---

## 📥 Installation

### 1. Download

Download the latest version from this GitHub repository.

### 2. Install Resource

Place the folder inside your FiveM resources directory:

```text
resources/[Ra7]/Ra7-Doj
```

### 3. Database

Import:

```text
[ INSTALL ]/Ra7Dev.sql
```

into your server database.

### 4. Tablet Item

Add the DOJ tablet item to your QBCore shared items.

The included image:

```text
[ INSTALL ]/doj_tablet.png
```

should be added to your inventory images folder.

Default tablet item name:

```lua
Config.TabletItem = 'doj_tablet'
```

### 5. Configure

Open:

```text
config.lua
```

and configure the system according to your server.

Example:

```lua
Config.DefaultLocale = 'en'
Config.SystemName = 'Ministry of Justice'
Config.ServerName = 'Your Server'
Config.TabletItem = 'doj_tablet'
```

Supported languages:

```text
en
ar
```

### 6. Configure DOJ Job

Default DOJ job:

```lua
Config.JudgeJobName = 'justic'
```

Configure your grade roles inside:

```lua
Config.JudgeGradeRoles
```

Available roles:

```text
lawyer
prosecutor
judge
```

### 7. Start Resource

Add to your `server.cfg`:

```cfg
ensure ox_lib
ensure oxmysql
ensure qb-core
ensure Ra7-Doj
```

Make sure your target resource is also started.

---

## 🔐 Permissions

Ra7-DOJ includes a configurable permission system.

Permissions can be customized for:

- Lawyers
- Prosecutors
- Judges

You can control access to:

- Cases
- Evidence
- Notes
- Verdicts
- Citizen Records
- Case Requests
- Audit Logs
- PDF Export
- And more

All permissions can be configured inside:

```lua
Config.Permissions
```

---

## 👮 Police Prosecutor

Police officers can optionally be allowed to act as prosecutors.

Example:

```lua
Config.PoliceProsecutor = {
    enabled = true,
    job = 'police',
    minGrade = 4,
}
```

Set:

```lua
enabled = false
```

if you don't want to use this feature.

---

## 🌐 Languages

Ra7-DOJ currently supports:

- 🇺🇸 English
- 🇸🇦 Arabic

Change the default language from:

```lua
Config.DefaultLocale = 'en'
```

---

## 🛠️ Configuration

Most features can be customized directly through:

```text
config.lua
```

Including:

- Server Name
- System Name
- Language
- DOJ Job
- DOJ Grades
- Police Prosecutor
- Permissions
- Kiosk Locations
- Evidence Limits
- Database Maintenance
- Case Types
- Case Statuses

---

## 💜 Ra7 Dev

Developed by:

**Ra7 Dev**

Developer:

**Ra7eem**

Discord:

https://discord.gg/WCnn2KBZJB

---

## ⚠️ Usage & Copyright

This resource is provided **for free** by Ra7 Dev.

You are allowed to:

- ✅ Download the resource
- ✅ Use it on your FiveM server
- ✅ Modify it for your own server

You are NOT allowed to:

- ❌ Sell this resource
- ❌ Re-upload or redistribute it under another name
- ❌ Claim the resource as your own work
- ❌ Remove or modify Ra7 Dev credits
- ❌ Sell modified versions of this resource

Please respect the work and keep the original credits.

---

## ⭐ Support the Project

If you like **Ra7-DOJ**, consider giving the repository a ⭐ Star.

It helps support Ra7 Dev and future free releases.

---

## © Ra7 Dev

**Ra7-DOJ V1**

Developed with ❤️ by **Ra7 Dev**

© 2026 Ra7 Dev. All Rights Reserved.
