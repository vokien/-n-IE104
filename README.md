# 🎓 Scopus & CORE Academic Venue Recommender
> **Đồ án môn học: IE104 - Internet và Công nghệ Web**  
> **Trường Đại học Công nghệ Thông tin (UIT) - ĐHQG-HCM**  
> **Giảng viên hướng dẫn**: ThS. Võ Tấn Khoa  
> **Repository GitHub**: [https://github.com/vokien/-n-IE104.git](https://github.com/vokien/-n-IE104.git)  
> **Hạn chót hoàn thành**: **07/11/2026**

---

## 🌟 GIỚI THIỆU ĐỀ TÀI
Hệ thống web hỗ trợ các nhà nghiên cứu, giảng viên và sinh viên tra cứu danh bạ và khuyến nghị nơi công bố khoa học tối ưu (Hội nghị / Tạp chí) dựa trên bản thảo bài báo.

### ✨ Các Tính Năng Nổi Bật:
1. **🔍 Tra Cứu Danh Bạ Đa Tiêu Chí (`venues.html`)**:
   - Lọc theo thứ hạng Scopus / SJR (**Q1, Q2, Q3, Q4**).
   - Lọc theo chuẩn xếp hạng hội nghị quốc tế **CORE 2026** (**A\*, A, B, C**).
   - Lọc theo chuyên ngành nghiên cứu (Khoa học máy tính, Trí tuệ nhân tạo, Mạng máy tính,...).
   - Phân trang (Pagination) mượt mà.
2. **🎯 Khuyến Nghị Bài Báo Thông Minh (`recommend.html`)**:
   - Thuật toán **TF-IDF & Cosine Similarity** thuần JavaScript phía client.
   - So khớp Tiêu đề, Tóm tắt (Abstract) và Từ khóa (Keywords) của bài báo với Scope/Aims của các venue.
   - Trả về Top-K venue phù hợp nhất kèm thanh điểm tương đồng Match Score (%) và từ khóa trùng khớp.
3. **⏳ Dòng Thời Gian CFP & Đếm Ngược Realtime (`timeline.html`)**:
   - Đồng hồ đếm ngược từng giây đến hạn nộp bài gần nhất.
   - Hỗ trợ chuẩn múi giờ quốc tế: **UTC** và múi giờ nghiên cứu học thuật **AoE (Anywhere on Earth)**.
   - Nhãn trạng thái tự động: *🟢 Open* (> 7 ngày), *🟡 Urgent* (< 7 ngày), *🔴 Closed*.
4. **❤️ Lưu Trữ Cá Nhân Phía Client (`js/storage.js`)**:
   - Đánh dấu yêu thích (Bookmarks), lưu lịch sử tìm kiếm vào `localStorage` của trình duyệt.
5. **🎨 Kiến Trúc Giao Diện Chuẩn**:
   - **100% Thẻ ngữ nghĩa Semantic HTML5**: `<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<aside>`, `<footer>`, `<time>`, `<figure>`.
   - **Mô hình bánh xe (Wheel Navigation Model)**: Trang chủ làm trục tâm (Hub), kết nối nan hoa với các trang vệ tinh và có trang sơ đồ site (`sitemap.html`).
   - **Chế độ Sáng / Tối (Dark / Light Mode)** chuyển đổi mượt mà bằng CSS Custom Properties.

---

## 🚫 CAM KẾT RÀNG BUỘC KỸ THUẬT (100% VANILLA CODE)
* **KHÔNG** sử dụng thư viện hoặc framework CSS/JS (Cấm Bootstrap, Tailwind, jQuery, React, Vue,...).
* **KHÔNG** sử dụng template có sẵn tải trên mạng - 100% mã nguồn do các thành viên tự lập trình từ đầu.
* **KHÔNG BẮT BUỘC BACKEND**: Hệ thống hoạt động độc lập mượt mà phía Client-side qua Fetch API nạp file tĩnh `data/venues.json`.
* **CHÍNH SÁCH BẢO MẬT (NO-KEY-LEAK)**: Tuyệt đối không commit file chứa API keys hoặc file môi trường (`.env`) lên GitHub.

---

## 📁 CẤU TRÚC THƯ MỤC REPOSITORY
```text
.
├── .gitignore               # Loại bỏ file rác, file .env, file hệ điều hành
├── README.md                # Tài liệu tổng quan dự án và hướng dẫn chạy
├── index.html               # Trang chủ (Hub tâm của mô hình bánh xe)
├── venues.html              # Trang danh bạ tra cứu hội nghị & tạp chí (TV3)
├── recommend.html           # Trang gợi ý bài báo theo thuật toán NLP (TV2)
├── timeline.html            # Trang dòng thời gian CFP & đếm ngược deadline (TV4)
├── about.html               # Trang giới thiệu đề tài và nhóm sinh viên (TV5)
├── contact.html             # Trang form liên hệ & góp ý (TV5)
├── sitemap.html             # Trang sơ đồ site theo mô hình bánh xe (TV5)
├── css/
│   ├── variables.css        # Hệ thống Design Tokens (:root, bảng màu HSL, Dark/Light)
│   ├── main.css             # Style khung dùng chung (Header, Footer, Wheel Nav)
│   ├── venues.css           # Style trang danh bạ và bộ lọc (TV3)
│   ├── recommend.css        # Style trang gợi ý bài báo (TV2)
│   └── timeline.css         # Style dòng thời gian và countdown (TV4)
├── js/
│   ├── storage.js           # Module LocalStorage & Bookmarks (TV1)
│   ├── recommender.js       # Module thuật toán TF-IDF & Cosine Similarity (TV2)
│   ├── filter.js            # Module nạp dữ liệu Fetch API & bộ lọc đa tiêu chí (TV3)
│   ├── countdown.js         # Module đồng hồ đếm ngược múi giờ UTC/AoE (TV4)
│   └── app.js               # Module theme Dark/Light & menu di động (TV5)
├── data/
│   └── venues_sample.json   # Hợp đồng dữ liệu mẫu (Data Contract) 5 items chuẩn
├── docs/                    # Tài liệu kế hoạch, phân công công việc chi tiết
│   ├── KE_HOACH_PHAN_CONG_DO_AN.md
│   └── BANG_PHAN_CONG_MINI_TASKS_IE104.xlsx
└── images/                  # Thư mục hình ảnh, logo, icons
```

---

## 👥 PHÂN CÔNG NHIỆM VỤ NHÓM (20% ĐÓNG GÓP / THÀNH VIÊN)

| STT | Thành viên | Vai trò phụ trách | File code chính | Báo cáo / Deliverable phụ trách |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Võ Kiên (Trưởng nhóm)** | Core Architecture & Storage | `index.html`, `js/storage.js`, `.gitignore`, `README.md` | Quản trị repo Git/Trello, Nộp `GroupX.docx`, Báo cáo PDF Phần 1 |
| **2** | **Thành viên 2** | NLP Recommender Engine Dev | `recommend.html`, `js/recommender.js`, `css/recommend.css` | Viết Chương Giải thuật gợi ý TF-IDF trong Báo cáo PDF |
| **3** | **Thành viên 3** | Data Engineering & Filter | `data/venues.json`, `venues.html`, `js/filter.js` | Viết Chương Cơ sở dữ liệu và Bộ lọc tra cứu trong Báo cáo PDF |
| **4** | **Thành viên 4** | Countdown & Timeline Dev | `timeline.html`, `js/countdown.js`, `css/timeline.css` | **Quay Video Demo sản phẩm, lồng tiếng & upload YouTube (Unlisted)** |
| **5** | **Thành viên 5** | UI/UX & Semantic Layout | `variables.css`, `main.css`, `about.html`, `sitemap.html`, `app.js` | **Vẽ Wireframe Figma, Thiết kế Slide thuyết trình 10-15 phút** |

*Chi tiết 25 mini-tasks kèm deadline và phương án dự phòng xem tại [docs/BANG_PHAN_CONG_MINI_TASKS_IE104.xlsx](docs/BANG_PHAN_CONG_MINI_TASKS_IE104.xlsx).*

---

## 📝 QUY ĐỊNH COMMIT GIT CHO CÁC THÀNH VIÊN
Để đảm bảo minh chứng đóng góp rõ ràng phục vụ chấm điểm môn học, tất cả các commit phải tuân theo cú pháp:
```bash
git commit -m "[Mã Task] Nội dung công việc thực hiện"
```
**Ví dụ mẫu:**
* `git commit -m "[T1.1] Khoi tao cau truc repo va file .gitignore chuan"`
* `git commit -m "[T2.2] Hoan thanh ham tokenizer va danh sach stopwords tieng Anh"`
* `git commit -m "[T3.4] Hoan thanh bo loc da chieu Scopus va phan trang venues.html"`
* `git commit -m "[T4.2] Hoan thanh dong ho dem nguoc thoi gian thuc mui gio AoE"`
* `git commit -m "[T5.1] Hoan thanh he thong Design Tokens variables.css va Dark Mode"`

---

## 🚀 HƯỚNG DẪN CLONE & CHẠY DỰ ÁN CỤC BỘ

### 1. Clone Repository về máy:
```bash
git clone https://github.com/vokien/-n-IE104.git
cd -n-IE104
```

### 2. Chạy ứng dụng trên trình duyệt:
* Do dự án sử dụng 100% Vanilla HTML, CSS, JavaScript thuần, bạn có thể:
  * **Cách 1**: Mở thư mục bằng **VS Code**, cài extension **Live Server** và nhấn **Go Live** tại file `index.html`.
  * **Cách 2**: Nhấp đúp chuột trực tiếp vào file `index.html` để mở trên Google Chrome / Firefox / Edge.
