<div align="center">

# 🎓 Certiflow

### One spreadsheet. Hundreds of certificates. Every one verifiable.

Make beautiful, print-ready certificates for your whole class, team, or event in just a few clicks.
No design skills. No sign-up wall. No software to install.

<br>

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-Open_Certiflow-f6c453?style=for-the-badge&labelColor=151033)](https://certiflow-chi.vercel.app/)

![Made with HTML CSS JS](https://img.shields.io/badge/Made%20with-HTML%20%7C%20CSS%20%7C%20JavaScript-ff8a4c?style=flat-square)
![Node.js](https://img.shields.io/badge/Backend-Node.js-3c873a?style=flat-square&logo=node.js&logoColor=white)
![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-success?style=flat-square)
![License MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

**[✨ Try it now](https://certiflow-chi.vercel.app/)** · **[📸 Screenshots](#-screenshots)** · **[🧰 Features](#-what-can-certiflow-do)**

</div>

---

## 👋 What is Certiflow?

Imagine you finished a course, a workshop, or a hackathon, and now you have to make **200 certificates**.
Typing every name by hand? Copy-pasting into Canva again and again? 😩

**Certiflow fixes this.** You upload one Excel or CSV file with your list of names, pick a design, and Certiflow creates every certificate for you. Each one gets:

- 🧑 the person's own **name**
- 📚 the right **course**
- 🔖 a **unique certificate ID**
- 🔳 a **QR code** that anyone can scan to check if the certificate is real

That's it. Upload → Map → Design → Download. ✅

---

## 🚀 Live Demo

Don't want to read? Just try it. It takes about one minute.

<div align="center">

### 👉 [**https://certiflow-chi.vercel.app/**](https://certiflow-chi.vercel.app/) 👈

</div>

**Quick test (no file needed):**

1. Open the link above
2. Click **"Try with sample data →"**
3. Watch your first certificate appear live 🎉
4. Use the ‹ › arrows to flip through every person
5. Change the design, colour, or text and see it update instantly

---


</div>

---

## 🧰 What can Certiflow do?

### 📂 Easy data upload
- Upload **Excel (`.xlsx`)**, **CSV**, or **TSV** files
- **Drag and drop** your file, or click to choose it
- Don't have a file yet? Download the **sample CSV** or use the built-in **sample data**

### 🧩 Smart column mapping
- Tell Certiflow which column is the **Name**, **Course**, **Date**, and an **Extra line** (like Grade or Score)
- Missing a column? Type the course or date once and it is used for everyone
- **Different course for each person?** No problem. Certiflow reads the course from every row

### ✍️ Your own words
- Institute / organisation name
- Certificate title (for example, *Certificate of Completion*)
- Intro line and action line (for example, *"This is to certify that… has successfully completed…"*)
- Signatory name and designation

### 🎨 Beautiful designs
- **3 templates:** Classic, Modern, and Minimal
- **5 ready colours** plus a colour picker for any shade you like
- Add your own **logo** and **signature image**
- 🔒 Your logo and signature **never leave your browser**

### 👀 Live preview
- See the certificate change **as you type**
- Flip through every recipient with the previous / next buttons
- **A4 landscape**, ready to print

### 🔐 Every certificate can be verified
- Each certificate has a **unique ID** like `CFL-7K3M-Q9XA-2WPD`
- IDs avoid confusing letters (no `0`, `O`, `1`, `I`), so they are easy to read aloud
- A **QR code** on the certificate opens a public **verify page**
- Anyone can also type the ID into the **"Verify"** box on the home page

### 📦 Download the way you like
| Option | What you get |
|---|---|
| 🆓 **Free sample** | 5 watermarked certificates in one PDF |
| 🔓 **Unlocked (free)** | Up to **500 certificates** per run, **no watermark** |
| 🗂️ **ZIP file** | One PDF for every person + a `register.csv` with all IDs and verify links |
| 📄 **Combined PDF** | Every certificate together in a single PDF |

---

## 🪄 How it works

```
 ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────────┐
 │ 1. Upload│ →  │  2. Map  │ →  │ 3. Design│ →  │ 4. Download│
 │ Excel/CSV│    │ columns  │    │ & preview│    │ PDF / ZIP  │
 └──────────┘    └──────────┘    └──────────┘    └────────────┘
```

1. **Upload** your list of recipients
2. **Map** the columns (Name, Course, Date, Extra line)
3. **Write** the certificate text and **pick** a design
4. **Preview** every certificate live
5. **Download** 5 free samples, or **unlock for free** to get the full batch
6. **Share**. Anyone can scan the QR code to confirm a certificate is genuine

---

## 🔒 Your privacy, in simple words

- 📊 Your spreadsheet is **read inside your browser**
- 🖼️ Your logo and signature **stay in your browser**
- ☁️ Only when you create a full (unlocked) batch, the **name, course, date, institute, and title** are sent to the server. This is needed to build the verification register.
- 🛡️ Certificate IDs are made by the **server**, not the browser, so nobody can fake them
- 🛡️ The 500 limit and the access check are also enforced on the **server**

---

## 🧱 Tech stack

| Part | Built with |
|---|---|
| 🖥️ Front end | Plain **HTML, CSS and JavaScript** (no frameworks, no libraries) |
| ⚙️ Back end | **Node.js** built-in `http` module |
| 💾 Storage | One simple **JSON file** (no database needed) |
| 🔳 QR codes | Own QR generator, written from the QR spec (Reed-Solomon + masking) |
| 📄 PDF / ZIP | Own lightweight PDF writer and ZIP writer |
| 📊 Excel reading | Own XLSX reader (an XLSX file is a ZIP of XML) |

Everything is built from scratch. That means the project is **tiny, fast, and easy to understand**. 💪

---

## 🗺️ Ideas for the future

- [ ] More certificate templates
- [ ] Custom fonts
- [ ] Send certificates directly by email
- [ ] Dashboard to see all issued certificates
- [ ] Support for more languages

Have an idea? Open an issue and tell me! 💬

---

## 🤝 Contributing

Contributions are welcome! 🙌

1. **Fork** this repository
2. Create a branch: `git checkout -b my-new-feature`
3. Make your changes and commit: `git commit -m "Add my new feature"`
4. Push it: `git push origin my-new-feature`
5. Open a **Pull Request**

Found a bug? Please open an **Issue** and explain what happened. Screenshots help a lot! 📸

---

## 📜 License

This project is licensed under the **MIT License**. You are free to use, change, and share it.

---

## 👨‍💻 Credits

<div align="center">

### Designed & developed with ❤️ by

## **Aayush Batole**

*Thank you for checking out Certiflow!*

If this project helped you, please give it a ⭐ on GitHub. It really makes my day. 😊

<br>

**[🚀 Try Certiflow Live](https://certiflow-chi.vercel.app/)**

</div>
