# KẾ HOẠCH PHÂN CÔNG CÔNG VIỆC & HƯỚNG DẪN THỰC HIỆN ĐỒ ÁN
## MÔN HỌC: IE104 - INTERNET VÀ CÔNG NGHỆ WEB (HK1 2026-2027)

* **Giảng viên phụ trách**: ThS. Võ Tấn Khoa
* **Đề tài**: Website tra cứu và khuyến nghị hội nghị / tạp chí xếp hạng Scopus / CORE cho đề tài nghiên cứu khoa học
* **Quy mô nhóm**: 5 sinh viên (Chia đều 20% khối lượng đóng góp / thành viên - Tổng đạt 100%)
* **Hình thức nộp**: File `GroupX.docx`, Repository GitHub (public), Video demo YouTube (unlisted), Báo cáo đồ án PDF (15-40 trang), Slide thuyết trình.

---

## MỤC LỤC
1. [Quy định bắt buộc & Tiêu chí đánh giá](#1-quy-định-bắt-buộc--tiêu-chí-đánh-giá)
2. [Cấu trúc mã nguồn chuẩn của dự án](#2-cấu-trúc-mã-nguồn-chuẩn-của-dự-án)
3. [Phân công công việc chi tiết cho 5 thành viên](#3-phân-công-công-việc-chi-tiết-cho-5-thành-viên)
   - [Thành viên 1: Nhóm trưởng & Core Architecture](#thành-viên-1-nhóm-trưởng--core-architecture)
   - [Thành viên 2: NLP Recommender Engine Developer](#thành-viên-2-nlp-recommender-engine-developer)
   - [Thành viên 3: Data Engineering & Directory Filter Developer](#thành-viên-3-data-engineering--directory-filter-developer)
   - [Thành viên 4: CFP Timeline & Countdown Tracker Developer](#thành-viên-4-cfp-timeline--countdown-tracker-developer)
   - [Thành viên 5: UI/UX Architect, Semantic Layout & Sitemap Specialist](#thành-viên-5-uiux-architect-semantic-layout--sitemap-specialist)
4. [Lộ trình thực hiện chi tiết theo 6 giai đoạn](#4-lộ-trình-thực-hiện-chi-tiết-theo-6-giai-đoạn)
5. [Tài nguyên kỹ thuật và mã nguồn tham khảo](#5-tài-nguyên-kỹ-thuật-và-mã-nguồn-tham-khảo)
6. [Checklist nghiệm thu trước khi nộp](#6-checklist-nghiệm-thu-trước-khi-nộp)

---

## 1. QUY ĐỊNH BẮT BUỘC & TIÊU CHÍ ĐÁNH GIÁ

### 1.1. Các ràng buộc kỹ thuật cốt lõi (Tuyệt đối tuân thủ)
* **100% Code thuần (Vanilla HTML, CSS, JavaScript)**: 
  * CẤM sử dụng thư viện hoặc framework CSS/JS có sẵn (Bootstrap, Tailwind, jQuery, React, Vue, Angular,...).
  * CẤM sử dụng template có sẵn tải từ trên mạng - phải tự tay code từ đầu.
* **Quy định về Backend**:
  * Đồ án tập trung phát triển giao diện và tương tác trên trình duyệt (Client-side).
  * Backend **không bắt buộc** (chỉ là tùy chọn nâng cao nếu nhóm có thời gian, không bị cấm). Hệ thống đảm bảo hoạt động độc lập mượt mà bằng việc nạp file JSON tĩnh qua Fetch API.
* **Quy định về thẻ ngữ nghĩa (Semantic HTML5)**:
  * Nếu có phần tử ngữ nghĩa tương đồng với phần tử vật lý thì **bắt buộc phải dùng phần tử ngữ nghĩa** (`<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<aside>`, `<footer>`, `<figure>`, `<time>`,...). Không lạm dụng toàn bộ thẻ `<div>` và `<span>`.
* **Cấu trúc điều hướng**:
  * Thiết kế theo **Mô hình bánh xe (Wheel Model)**: Trang chủ làm trục tâm (Hub), kết nối nan hoa với các trang nội dung vệ tinh.
  * Phải có trang **Sơ đồ trang web (Sitemap)** trực quan.
* **Chính sách bảo mật (No-Key-Leak)**:
  * Tuyệt đối không commit file chứa API key cá nhân hoặc file môi trường (`.env`, `.env.local`) lên GitHub public. Bắt buộc có file `.gitignore` chuẩn.

### 1.2. Thang điểm đánh giá (Tổng 100%)
* **Chất lượng code (30%)**: Code sạch sẽ, cấu trúc file mạch lạc, có comment giải thích rõ ràng.
* **Hoàn thiện chức năng (30%)**: Đầy đủ tính năng tra cứu, lọc đa tiêu chí và thuật toán gợi ý theo bài báo.
* **Giao diện & Responsive (15%)**: Thiết kế đẹp mắt, hiển thị chuẩn trên cả Mobile và Desktop (Flexbox/Grid).
* **Báo cáo & Thuyết trình (15%)**: Báo cáo PDF chuyên nghiệp (15-40 trang), Slide đẹp, thuyết trình trôi chảy.
* **Sáng tạo & Tối ưu hóa (10%)**: Thuật toán NLP client-side, đồng hồ đếm ngược thời gian thực, Dark/Light mode.

---

## 2. CẤU TRÚC MÃ NGUỒN CHUẨN CỦA DỰ ÁN

Toàn bộ mã nguồn đưa vào thư mục theo đúng quy định của môn học:

```text
project/
├── .gitignore               # Loại bỏ các file rác, file .env, file hệ thống
├── README.md                # Tài liệu hướng dẫn cài đặt, sử dụng và cấu trúc nhóm
├── index.html               # Trang chủ (Hub tâm điểm của mô hình bánh xe)
├── venues.html              # Trang danh bạ tra cứu hội nghị & tạp chí Scopus/CORE
├── recommend.html           # Trang khuyến nghị nộp bài dựa trên abstract bản thảo
├── timeline.html            # Trang lịch trình Call-for-Papers và đếm ngược deadline
├── about.html               # Trang giới thiệu thành viên, mục tiêu đề tài
├── contact.html             # Trang liên hệ và form góp ý (validate bằng JS)
├── sitemap.html             # Trang sơ đồ website trực quan theo mô hình bánh xe
├── css/
│   ├── variables.css        # Hệ thống biến CSS (:root, bảng màu HSL, typography, Dark/Light)
│   ├── main.css             # Style khung dùng chung (Header, Nav bánh xe, Footer, Reset)
│   ├── venues.css           # Style riêng cho trang danh bạ và bộ lọc
│   ├── recommend.css        # Style riêng cho trang nhập abstract và kết quả matching
│   └── timeline.css         # Style riêng cho dòng thời gian và đồng hồ đếm ngược
├── js/
│   ├── storage.js           # Quản lý Bookmark, LocalStorage, lịch sử tìm kiếm (TV1)
│   ├── recommender.js       # Thuật toán NLP TF-IDF & Cosine Similarity thuần (TV2)
│   ├── filter.js            # Xử lý Fetch dữ liệu, tìm kiếm và lọc đa tiêu chí (TV3)
│   ├── countdown.js         # Thuật toán đếm ngược thời gian thực theo múi giờ UTC/AoE (TV4)
│   └── app.js               # Logic điều hướng chung, Dark/Light toggle, Mobile menu (TV5)
├── data/
│   └── venues.json          # Cơ sở dữ liệu học thuật tĩnh (~300-500 hội nghị & tạp chí)
└── images/                  # Chứa logo, icons SVG, ảnh minh họa
```

---

## 3. PHÂN CÔNG CÔNG VIỆC CHI TIẾT CHO 5 THÀNH VIÊN

---

### THÀNH VIÊN 1: NHÓM TRƯỞNG & CORE ARCHITECTURE
* **Tỷ lệ đóng góp**: **20%**
* **File đảm nhiệm chính**:
  * `project/index.html` (Trang chủ)
  * `project/js/storage.js` (Module LocalStorage)
  * `project/.gitignore` và `project/README.md`
  * Tài liệu `GroupX.docx`

#### Nhiệm vụ Kỹ thuật (Code):
1. **Thiết lập hạ tầng dự án**:
   * Tạo repository GitHub (Public), mời các thành viên tham gia cộng tác.
   * Viết file `.gitignore` chuẩn (chặn `.env`, `.DS_Store`, `node_modules`).
   * Viết `README.md` giới thiệu đề tài, hướng dẫn mở trang web và phân công nhóm.
2. **Xây dựng Trang chủ (`index.html`)**:
   * Thiết kế theo vai trò **Trục tâm (Hub)** trong mô hình bánh xe.
   * Khu vực Hero Banner: Lời chào, ô tìm kiếm nhanh chuyển hướng tới trang danh bạ.
   * Khu vực Thống kê trực quan (Stats counter): Tổng số tạp chí Scopus Q1-Q4, tổng số hội nghị CORE A*-C.
   * Khu vực Phím tắt tính năng (Featured Cards): Dẫn đến *Khuyến nghị bài báo*, *Lịch CFP gần nhất*, *Danh sách đã lưu*.
3. **Phát triển Module Quản lý Lưu trữ (`js/storage.js`)**:
   * Viết class/hàm quản lý `localStorage` an toàn (có bọc `try/catch` chống tràn quota).
   * Chức năng Đánh dấu yêu thích (Bookmarks): Thêm/xóa venue, kiểm tra trạng thái đã lưu.
   * Chức năng Lịch sử tìm kiếm (Search history): Lưu 5 truy vấn tìm kiếm gần nhất.
   * Modal xem nhanh danh sách Bookmark ngay trên Header.

#### Nhiệm vụ Quản lý & Báo cáo:
* Lập bảng Kanban trên Trello/Notion theo dõi tiến độ tuần.
* Đóng gói file `GroupX.docx` nộp lên hệ thống của trường.
* Viết phần *Mở đầu, Tổng quan bài toán và Kiến trúc tổng thể* trong Báo cáo PDF.

#### Chỉ tiêu Git:
* Tối thiểu 10-15 commits phân bổ từ Tuần 1 đến Tuần 10.

---

### THÀNH VIÊN 2: NLP RECOMMENDER ENGINE DEVELOPER
* **Tỷ lệ đóng góp**: **20%**
* **File đảm nhiệm chính**:
  * `project/recommend.html` (Trang khuyến nghị bài báo)
  * `project/js/recommender.js` (Thuật toán NLP thuần)
  * `project/css/recommend.css`

#### Nhiệm vụ Kỹ thuật (Code):
1. **Phát triển Động cơ Khuyến nghị học thuật (`js/recommender.js`)**:
   * Lập trình **100% bằng Vanilla JavaScript thuần**, không dùng thư viện ngoài.
   * **Bước 1 (Tiền xử lý văn bản)**: Viết hàm tách từ (Tokenize), chuyển chữ thường, loại bỏ ký tự đặc biệt.
   * **Bước 2 (Lọc từ dừng - Stopwords)**: Tích hợp danh sách ~150 từ dừng tiếng Anh thông dụng + từ dừng học thuật (`paper`, `propose`, `method`, `approach`, `results`,...).
   * **Bước 3 (TF-IDF Vectorization)**:
     * Tính tần suất từ (Term Frequency - TF) trong đoạn văn bản người dùng nhập.
     * Tính nghịch đảo tần suất tài liệu (Inverse Document Frequency - IDF) dựa trên kho Scope/Keywords của các venue.
   * **Bước 4 (Cosine Similarity)**:
     * Tính tích vô hướng và độ dài vector giữa bài báo và từng hội nghị/tạp chí.
     * Trả về điểm phù hợp (Match Score từ 0% đến 100%) và danh sách từ khóa trùng khớp (Matched Keywords).
2. **Xây dựng Trang Khuyến nghị bài báo (`recommend.html`)**:
   * Form tiếp nhận dữ liệu: Ô nhập Tiêu đề bài báo (Title), Tóm tắt (Abstract), Từ khóa (Keywords).
   * Bộ lọc bổ sung: Người dùng có thể chọn ưu tiên tìm *Hội nghị*, *Tạp chí*, hoặc *Mức rank tối thiểu*.
   * Giao diện Kết quả gợi ý: Danh sách Top-5 hoặc Top-10 venue phù hợp nhất, thanh đo điểm phần trăm tương đồng (Progress bar), hiển thị các từ khóa trùng lặp làm căn cứ giải thích.

#### Nhiệm vụ Báo cáo:
* Viết chi tiết **Chương Giải thuật và Cơ chế khuyến nghị** trong Báo cáo PDF (trình bày công thức toán học TF-IDF, Cosine Similarity, lưu đồ giải thuật, phân tích độ phức tạp).

#### Chỉ tiêu Git:
* Tối thiểu 10-15 commits về tiền xử lý văn bản, hàm ma trận TF-IDF, giao diện trang recommend.

---

### THÀNH VIÊN 3: DATA ENGINEERING & DIRECTORY FILTER DEVELOPER
* **Tỷ lệ đóng góp**: **20%**
* **File đảm nhiệm chính**:
  * `project/data/venues.json` (Bộ dữ liệu học thuật)
  * `project/venues.html` (Trang danh bạ hội nghị & tạp chí)
  * `project/js/filter.js` (Logic tìm kiếm, lọc và phân trang)
  * `project/css/venues.css`

#### Nhiệm vụ Kỹ thuật (Code):
1. **Xây dựng và Chuẩn hóa Dataset (`data/venues.json`)**:
   * Thu thập dữ liệu từ Scopus (SJR dataset) và CORE Conference Rankings 2026.
   * Làm sạch và chuẩn hóa khoảng 300-500 venue phổ biến ngành CNTT, Khoa học dữ liệu, Điện tử - Viễn thông.
   * Cấu trúc mỗi phần tử JSON gồm:
     * `id`, `name`, `acronym`, `type` ("journal" | "conference")
     * `publisher`, `scopus_rank` ("Q1" | "Q2" | "Q3" | "Q4" | null)
     * `core_rank` ("A*" | "A" | "B" | "C" | null)
     * `citescore`, `sjr`, `h_index`, `open_access` (boolean)
     * `subject_area` (mảng chuyên ngành)
     * `scope_keywords` (danh sách từ khóa mô tả để TV2 so khớp)
     * `submission_deadlines` (các mốc thời gian nộp bài để TV4 tính đếm ngược)
     * `homepage_url`
2. **Phát triển Bộ lọc Đa tiêu chí & Tìm kiếm (`js/filter.js`)**:
   * Viết hàm nạp file `venues.json` bằng Fetch API (có hiệu ứng Loading/Skeleton).
   * Lọc đa chiều tức thời:
     * Theo từ khóa (Tên venue, Acronym, Nhà xuất bản).
     * Theo Loại hình (Tạp chí vs Hội nghị).
     * Theo Thứ hạng Scopus (Q1, Q2, Q3, Q4) hoặc CORE (A*, A, B, C).
     * Theo Chuyên ngành (Computer Science, Artificial Intelligence, Software Engineering,...).
     * Sắp xếp theo CiteScore, SJR, hoặc Hạn nộp bài gần nhất.
   * Cơ chế Phân trang (Pagination) mượt mà (10-20 kết quả/trang).
3. **Xây dựng Trang Danh bạ (`venues.html`)**:
   * Bố cục 2 cột bằng CSS Grid: Cột trái chứa thanh lọc đa tiêu chí (Sidebar Facets), cột phải chứa danh sách thẻ Venue card tương tác.

#### Nhiệm vụ Báo cáo:
* Viết **Chương Cơ sở dữ liệu và Chức năng tra cứu** trong Báo cáo PDF (lược đồ dữ liệu JSON, nguồn gốc dữ liệu, bảng thống kê phân bố thứ hạng).

#### Chỉ tiêu Git:
* Tối thiểu 10-15 commits về cấu trúc JSON, xử lý nạp Fetch API, logic lọc và render DOM.

---

### THÀNH VIÊN 4: CFP TIMELINE & COUNTDOWN TRACKER DEVELOPER
* **Tỷ lệ đóng góp**: **20%**
* **File đảm nhiệm chính**:
  * `project/timeline.html` (Trang dòng thời gian Call-for-Papers)
  * `project/js/countdown.js` (Logic đếm ngược thời gian thực)
  * `project/css/timeline.css`
  * Video demo sản phẩm trên YouTube (Unlisted)

#### Nhiệm vụ Kỹ thuật (Code):
1. **Phát triển Động cơ Đếm ngược thời gian thực (`js/countdown.js`)**:
   * Lập trình đồng hồ đếm ngược bằng Vanilla JavaScript (`setInterval` / `Date` object).
   * Xử lý múi giờ quốc tế: Hỗ trợ múi giờ UTC và múi giờ nghiên cứu học thuật chuẩn **AoE (Anywhere on Earth)**.
   * Tính toán và hiển thị chính xác số ngày, giờ, phút, giây còn lại đến hạn nộp bài gần nhất của từng hội nghị.
   * Tự động cập nhật nhãn trạng thái:
     * 🟢 *Open*: Còn trên 7 ngày.
     * 🟡 *Urgent*: Còn dưới 7 ngày (hiệu ứng nhấp nháy thu hút sự chú ý).
     * 🔴 *Closed / Passed*: Đã qua hạn nộp.
2. **Xây dựng Dòng thời gian trực quan (Interactive Timeline - `timeline.html`)**:
   * Thiết kế bằng CSS thuần (không dùng thư viện ngoài) hiển thị các mốc sự kiện của hội nghị:
     * *Mốc 1: Abstract Registration Deadline*
     * *Mốc 2: Full Paper Submission Deadline*
     * *Mốc 3: Notification of Acceptance*
     * *Mốc 4: Conference Date*
   * Tự động highlight mốc thời gian hiện tại dựa trên ngày thực tế của hệ thống.
   * Responsive: Hiển thị dòng thời gian ngang trên Desktop và tự động chuyển thành trục dọc trên Mobile.

#### Nhiệm vụ Media & Báo cáo:
* **Chịu trách nhiệm chính quay video màn hình demo toàn bộ chức năng trang web, lồng tiếng thuyết minh và đăng lên YouTube ở chế độ Unlisted** (bắt buộc nộp ở Tuần 10).
* Viết phần *Chức năng mở rộng và Tính năng sáng tạo* trong Báo cáo PDF.

#### Chỉ tiêu Git:
* Tối thiểu 10-15 commits về logic tính toán thời gian, style dòng thời gian CSS, cập nhật giao diện đếm ngược.

---

### THÀNH VIÊN 5: UI/UX ARCHITECT, SEMANTIC LAYOUT & SITEMAP SPECIALIST
* **Tỷ lệ đóng góp**: **20%**
* **File đảm nhiệm chính**:
  * `project/css/variables.css` và `project/css/main.css`
  * `project/about.html`, `project/contact.html`, `project/sitemap.html`
  * `project/js/app.js` (Điều hướng chung, Theme toggle, Mobile Drawer)
  * Figma Mockup / Wireframe và Slide thuyết trình

#### Nhiệm vụ Kỹ thuật (Code):
1. **Xây dựng Hệ thống Design Tokens & CSS dùng chung**:
   * `variables.css`: Khai báo bảng màu sắc HSL hài hòa, typography chuẩn, khoảng cách (spacing), hiệu ứng bóng đổ (box-shadow).
   * Hỗ trợ chuyển đổi giao diện **Dark Mode / Light Mode** mượt mà bằng CSS Variables và JavaScript.
   * `main.css`: Cấu trúc Header, thanh điều hướng Navigation mô hình bánh xe, Footer dùng chung cho toàn bộ các trang.
   * Đảm bảo **100% sử dụng thẻ ngữ nghĩa Semantic HTML5** trên tất cả các trang, loại bỏ lạm dụng thẻ div không cần thiết.
   * Thiết lập bố cục CSS Grid và Flexbox responsive toàn diện từ màn hình 320px đến 1920px.
2. **Xây dựng các Trang vệ tinh theo Mô hình Bánh xe (Wheel Model)**:
   * **`about.html`**: Giới thiệu mục tiêu của hệ thống, hướng dẫn sử dụng, thông tin chi tiết của 5 thành viên trong nhóm và giảng viên hướng dẫn.
   * **`contact.html`**: Form gửi góp ý, báo cáo sai lệch thông tin hội nghị; validate dữ liệu đầu vào bằng JavaScript thuần (kiểm tra định dạng email, độ dài tin nhắn).
   * **`sitemap.html`**: Trang sơ đồ website trực quan, mô phỏng đúng cấu trúc bánh xe với Trang chủ là tâm và các nan hoa trỏ tới các trang con.
3. **Phát triển Module Tương tác chung (`js/app.js`)**:
   * Xử lý nút bật/tắt Dark Mode và lưu trạng thái vào `localStorage`.
   * Xử lý thanh điều hướng Hamburger menu trên thiết bị di động (Mobile Drawer).

#### Nhiệm vụ Thiết kế & Thuyết trình:
* Phác thảo bản vẽ Mockup/Wireframe bằng **Figma** trong Tuần 1-2.
* **Thiết kế bộ Slide thuyết trình bảo vệ đồ án** (PowerPoint / Canva chuyên nghiệp, thời lượng 10-15 phút).
* Đồng chủ trì buổi thuyết trình và trả lời câu hỏi vấn đáp trước lớp.

#### Chỉ tiêu Git:
* Tối thiểu 10-15 commits về hệ sinh thái CSS, Dark/Light mode, các trang About, Contact, Sitemap.

---

### 3.6. BẢNG 25 MINI-TASKS, HẠN CHÓT 07/11/2026 & PHƯƠNG ÁN DỰ PHÒNG (FALLBACK)

> [!IMPORTANT]
> Toàn bộ 25 mini-tasks kèm ngày bắt đầu, ngày kết thúc, phân tích task phụ thuộc và phương án dự phòng (Mocking/Fallback Plan) đã được đóng gói thành file Excel tương tác tại:
> 👉 **[BANG_PHAN_CONG_MINI_TASKS_IE104.xlsx](file:///d:/Workspace/IE104%20Internet%20v%C3%A0%20c%C3%B4ng%20ngh%E1%BB%87%20web/BANG_PHAN_CONG_MINI_TASKS_IE104.xlsx)**

| Mã Task | Thành viên | Tên Mini-Task | Bắt đầu | HẠN CHÓT | Task Tiên quyết (Dependency) | PHƯƠNG ÁN DỰ PHÒNG (FALLBACK NẾU CHƯA XONG) |
| :---: | :---: | :--- | :---: | :---: | :--- | :--- |
| **T1.1** | TV1 (Leader) | Khởi tạo Git repo, .gitignore, README, Trello | 01/10 | **04/10** | Không có (Độc lập) | TV1 làm ngay để cả nhóm có repo clone về làm việc. |
| **T1.2** | TV1 (Leader) | Dựng HTML/CSS Trang chủ index.html | 09/10 | **16/10** | T5.1 (variables.css) | Dùng màu tạm thời, refactor sang biến CSS trong 5 phút. |
| **T1.3** | TV1 (Leader) | Viết module js/storage.js (Bookmark, LocalStorage) | 19/10 | **26/10** | T3.1 (venues_sample.json) | **Dùng Mock Venue**: TV1 tự tạo biến venue mẫu để test LocalStorage độc lập. |
| **T1.4** | TV1 (Leader) | Tích hợp tổng thể & Deploy GitHub Pages | 29/10 | **03/11** | T2.3, T3.3, T4.3, T5.3 | Trang nào chưa xong thì để link tạm hoặc trang skeleton để deploy trước. |
| **T1.5** | TV1 (Leader) | Nộp GroupX.docx & Viết Phần 1 Báo cáo PDF | 04/11 | **07/11** | T4.4 (Link video YouTube) | Soạn sẵn toàn bộ văn bản, chỉ chờ link video là chèn vào xuất file nộp. |
| **T2.1** | TV2 (NLP) | Dựng HTML/CSS Trang recommend.html | 09/10 | **16/10** | T5.1 (variables.css) | Dùng CSS thuần cơ bản, đồng bộ biến màu sau. |
| **T2.2** | TV2 (NLP) | Viết Tokenizer & Lọc Stopwords học thuật | 17/10 | **22/10** | Không có (Độc lập 100%) | Logic xử lý chuỗi JS thuần túy, test trực tiếp qua console.log. |
| **T2.3** | TV2 (NLP) | Thuật toán TF-IDF & Cosine Similarity thuần | 23/10 | **28/10** | T3.1 (Trường scope_keywords) | **Dùng Mock Corpus**: Tự tạo mảng 3 đoạn abstract mẫu để test thuật toán. |
| **T2.4** | TV2 (NLP) | Tích hợp gợi ý với dữ liệu và recommend.html | 29/10 | **02/11** | T3.2 (File venues.json hoàn chỉnh) | Nếu data lớn chưa xong, dùng venues_sample.json (30 items) chạy trước. |
| **T2.5** | TV2 (NLP) | Viết Chương Giải thuật trong Báo cáo PDF | 03/11 | **06/11** | T2.3 (Thuật toán đã chạy) | Viết lý thuyết và công thức toán trước, bổ sung số liệu kiểm thử sau. |
| **T3.1** | TV3 (Data) | Chốt Schema & venues_sample.json (5 items) | 01/10 | **05/10** | Không có (ƯU TIÊN SỐ 1) | **CRITICAL**: Nếu trễ, TV1 phát hành file mẫu 5 trường cơ bản cho nhóm. |
| **T3.2** | TV3 (Data) | Làm sạch Scopus/CORE -> data/venues.json | 06/10 | **18/10** | T3.1 (Schema đã chốt) | Phát hành đợt 1 gồm 100 venue tiêu biểu trước ngày 15/10 để nhóm code. |
| **T3.3** | TV3 (Data) | Dựng HTML/CSS Trang danh bạ venues.html | 10/10 | **17/10** | T5.1 (variables.css) | Dùng CSS Grid chuẩn, tự hardcode 4 card mẫu để căn responsive. |
| **T3.4** | TV3 (Data) | Viết logic lọc đa tiêu chí js/filter.js | 19/10 | **27/10** | T3.1, T3.3 | Dùng file venues_sample.json để hoàn thiện logic lọc Array.filter(). |
| **T3.5** | TV3 (Data) | Viết Chương Cơ sở dữ liệu trong Báo cáo PDF | 02/11 | **06/11** | T3.2, T3.4 | Viết phần mô tả lược đồ JSON và phương pháp thu thập dữ liệu trước. |
| **T4.1** | TV4 (Timer) | Dựng HTML/CSS Trang timeline.html | 09/10 | **17/10** | T5.1 (variables.css) | Dùng CSS Flexbox/Grid độc lập trong timeline.css. |
| **T4.2** | TV4 (Timer) | Viết đồng hồ đếm ngược js/countdown.js | 19/10 | **26/10** | T3.1 (Trường deadline) | **Dùng Mock Dates**: Tự gán 3 ngày giả định để test đếm ngược thời gian thực. |
| **T4.3** | TV4 (Timer) | Tích hợp Countdown vào card và timeline.html | 28/10 | **02/11** | T3.3 (Card layout từ TV3) | Viết countdown thành hàm độc lập nhận containerId, TV3 chỉ việc chèn div. |
| **T4.4** | TV4 (Timer) | QUAY VIDEO DEMO SẢN PHẨM & YOUTUBE UNLISTED | 03/11 | **05/11** | T1.4 (Web live hoặc localhost) | Nếu GitHub Pages chậm, quay trực tiếp trên localhost qua Live Server. |
| **T4.5** | TV4 (Timer) | Viết Phần Tính năng sáng tạo trong PDF | 04/11 | **07/11** | T4.2 | Viết trước tài liệu về cơ chế múi giờ AoE và hiệu ứng CSS animation. |
| **T5.1** | TV5 (UI/UX) | Xây dựng Design Tokens css/variables.css | 01/10 | **06/10** | Không có (ƯU TIÊN SỐ 1) | **CRITICAL**: Bàn giao sớm trước 06/10. Nếu trễ, nhóm dùng bảng màu có sẵn. |
| **T5.2** | TV5 (UI/UX) | Thiết kế Wireframe / Mockup trên Figma | 04/10 | **10/10** | T5.1 | Nếu chưa xong Figma, vẽ tay hoặc Excalidraw gửi nhóm hình dung bố cục. |
| **T5.3** | TV5 (UI/UX) | Dựng main.css, about.html, contact, sitemap | 11/10 | **20/10** | T5.1 | Lập trình các trang tĩnh vệ tinh bánh xe bằng Semantic HTML5 thuần túy. |
| **T5.4** | TV5 (UI/UX) | Viết js/app.js (Dark/Light mode & Mobile Drawer) | 21/10 | **27/10** | T5.1, T5.3 | Test Dark mode trên about.html và contact.html trước khi áp dụng toàn trang. |
| **T5.5** | TV5 (UI/UX) | THIẾT KẾ SLIDE BẢO VỆ ĐỒ ÁN (10-15 PHÚT) | 02/11 | **06/11** | T1.4 (Web đã chạy) | Chuẩn bị khung slide từ tuần 4, chỉ chụp ảnh màn hình web chèn vào sau. |

---

## 4. LỘ TRÌNH THỰC HIỆN CHI TIẾT THEO 6 GIAI ĐOẠN (HẠN CUỐI: 07/11/2026)

```
Tuần 1-2 ──► Tuần 3-6 ──► Tuần 7-9 ──► Tuần 10 (Sơ khảo) ──► Tuần 11 (Bảo vệ)
 [Figma &     [HTML/CSS    [JavaScript    [Kiểm thử, Video      [Báo cáo PDF,
  Kế hoạch]    Thuần]       Tính năng]     & Nộp GroupX.docx]    Slide & Demo]
```

### Giai đoạn 1: Xác định đề tài & Lập kế hoạch (Tuần 1 - Tuần 2)
* **TV1**: Khởi tạo repository GitHub, tạo nhánh `main` và nhánh phát triển `dev`, thiết lập file `.gitignore` và `README.md`. Tạo workspace quản lý nhiệm vụ trên Trello/Notion.
* **TV5**: Thiết kế Wireframe/Mockup giao diện website trên Figma (ít nhất 4 màn hình: Trang chủ, Danh bạ, Khuyến nghị, Lịch CFP).
* **TV3**: Khảo sát nguồn dữ liệu Scopus SJR và CORE rankings, lập dàn ý file dữ liệu `venues.json`.
* **Cả nhóm**: Họp nhóm, thống nhất tên biến CSS, quy ước đặt tên class (BEM hoặc ngữ nghĩa).

### Giai đoạn 2: Xây dựng Cấu trúc HTML & CSS Thuần (Tuần 3 - Tuần 6)
* **TV5**: Hoàn thiện `variables.css` và `main.css`, chuẩn hóa Header và Footer.
* **TV1**: Dựng HTML/CSS khung Trang chủ `index.html`.
* **TV2**: Dựng HTML/CSS Trang khuyến nghị `recommend.html`.
* **TV3**: Dựng HTML/CSS Trang danh bạ `venues.html`.
* **TV4**: Dựng HTML/CSS Trang timeline `timeline.html`.
* **TV5**: Dựng HTML/CSS các trang `about.html`, `contact.html`, `sitemap.html`.
* **Kiểm tra chốt Giai đoạn 2**: Kiểm tra tính Responsive trên trình duyệt (F12 Mobile mode) và kiểm tra chuẩn thẻ Semantic HTML5.

### Giai đoạn 3: Lập trình JavaScript Tương tác (Tuần 7 - Tuần 9)
* **TV3**: Hoàn thiện file `data/venues.json`, viết `js/filter.js` nạp Fetch API và xử lý bộ lọc đa chiều.
* **TV2**: Viết `js/recommender.js`, kiểm thử giải thuật TF-IDF và Cosine Similarity trên dữ liệu mẫu.
* **TV4**: Viết `js/countdown.js`, tích hợp đồng hồ đếm ngược vào thẻ venue và trang timeline.
* **TV1**: Viết `js/storage.js`, hoàn thiện chức năng Bookmark và danh sách đã lưu.
* **TV5**: Viết `js/app.js`, hoàn thiện Dark/Light mode và mobile menu toggle.
* **Tích hợp**: Ghép nối các module JS vào các trang tương ứng.

### Giai đoạn 4 & 5: Kiểm thử, Tối ưu & Nộp hồ sơ (Tuần 10)
* **Cả nhóm**: Kiểm thử chéo (Cross-testing) toàn bộ chức năng, kiểm tra các trường hợp ngoại lệ (không tìm thấy kết quả, abstract quá ngắn, màn hình nhỏ 320px).
* **Tối ưu code**: Dọn dẹp CSS dư thừa, kiểm tra comment giải thích trong từng file JS.
* **Triển khai**: Bật tính năng **GitHub Pages** (hoặc Netlify) để website chạy trực tiếp trên Internet.
* **TV4**: Quay video demo toàn bộ website, tải lên YouTube ở chế độ **Unlisted**.
* **TV1**: Điền thông tin nhóm vào file **`GroupX.docx`** (tên thành viên, MSSV, % đóng góp 20% mỗi người, link GitHub public, link Trello/Notion, link Video YouTube demo). Nộp file lên hệ thống môn học.

### Giai đoạn 6: Hoàn thiện Báo cáo & Bảo vệ Đồ án (Tuần 11)
* **Cả nhóm**: Hợp lực viết cuốn **Báo cáo đồ án PDF (15-40 trang)**:
  * Phần 1: Mở đầu & Cơ sở lý thuyết (TV1)
  * Phần 2: Kiến trúc hệ thống & Thiết kế giao diện Semantic (TV5)
  * Phần 3: Cơ sở dữ liệu học thuật & Chức năng tra cứu (TV3)
  * Phần 4: Thuật toán khuyến nghị NLP TF-IDF (TV2)
  * Phần 5: Tính năng đếm ngược thời gian thực & Kết quả kiểm thử (TV4)
  * Phần 6: Đánh giá, Hướng phát triển & Kết luận (TV1)
* **TV5**: Hoàn thiện Slide báo cáo (10-15 phút thuyết trình).
* **Thuyết trình & Demo sản phẩm trước lớp**.

---

## 5. TÀI NGUYÊN KỸ THUẬT VÀ MÃ NGUỒN THAM KHẢO

Dưới đây là các tài nguyên đã được trinh sát qua ReuseForge để các thành viên sử dụng làm tài liệu tham khảo:

### Dành cho TV1 (Quản lý Lưu trữ & Git):
* **File `.gitignore` chuẩn cho dự án web**:
  ```text
  # Hệ điều hành & IDE
  .DS_Store
  Thumbs.db
  .vscode/
  .idea/

  # File môi trường & bí mật (Bắt buộc không upload)
  .env
  .env.*
  *.local
  *.key
  secrets.*
  ```

### Dành cho TV2 (Thuật toán NLP TF-IDF thuần JS):
* **Công thức tính Cosine Similarity**:
  $$\text{Cosine Similarity}(\vec{A}, \vec{B}) = \frac{\vec{A} \cdot \vec{B}}{\|\vec{A}\| \|\vec{B}\|} = \frac{\sum_{i=1}^n A_i B_i}{\sqrt{\sum_{i=1}^n A_i^2} \sqrt{\sum_{i=1}^n B_i^2}}$$
* **Mã nguồn tham khảo**: [Vanilla JS TF-IDF & Cosine Similarity Implementation](https://alexop.dev/posts/cosine-similarity-tfidf-javascript/)

### Dành cho TV3 (Dataset Scopus & CORE):
* **Dữ liệu Scopus SJR**: [SCImagoJournalRankIndicators trên GitHub](https://github.com/Michael-E-Rose/SCImagoJournalRankIndicators) (tải file CSV lọc lấy tạp chí ngành Computer Science).
* **Dữ liệu CORE Conference 2026**: [icore-ranks trên GitHub](https://github.com/benkeks/icore-ranks) hoặc tra cứu trực tiếp tại [CORE Portal](https://portal.core.edu.au/conf-ranks/).

### Dành cho TV4 (Thuật toán đếm ngược & Timeline):
* **Đếm ngược thời gian thực**: Tham khảo logic xử lý múi giờ UTC/AoE từ dự án [ai-deadlines trên GitHub](https://github.com/paperswithcode/ai-deadlines).
* **CSS Timeline Component**: Tham khảo mẫu layout Timeline thuần trên [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Flexbox).

### Dành cho TV5 (Design Tokens & Semantic HTML):
* **Bảng màu gợi ý (Dark/Light HSL Tailored)**:
  * Primary: `hsl(215, 80%, 55%)` (Xanh học thuật tin cậy)
  * Secondary: `hsl(165, 75%, 45%)` (Xanh ngọc gợi ý thành công)
  * Accent (Deadlines): `hsl(15, 90%, 60%)` (Cam cảnh báo deadline gấp)
  * Background (Light): `hsl(210, 20%, 98%)` / Background (Dark): `hsl(220, 25%, 10%)`
  * Text (Light): `hsl(220, 25%, 15%)` / Text (Dark): `hsl(210, 20%, 95%)`

---

## 6. CHECKLIST NGHIỆM THU TRƯỚC KHI NỘP

Trước khi nộp bài ở Tuần 10 và thuyết trình ở Tuần 11, nhóm trưởng (TV1) phải cùng cả nhóm duyệt qua checklist sau:

- [ ] **Không vi phạm quy định cấm**: Kiểm tra không có bất kỳ dòng link nào tới Bootstrap, Tailwind, jQuery trong toàn bộ các file `.html`.
- [ ] **100% Code tự viết**: Không dùng template tải trên mạng.
- [ ] **Đúng chuẩn Semantic HTML**: Trang web có đầy đủ `<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<aside>`, `<footer>`, `<figure>`, `<time>`.
- [ ] **Mô hình bánh xe & Sitemap**: Trang `sitemap.html` hoạt động và thể hiện đúng cấu trúc các trang liên kết với `index.html`.
- [ ] **An toàn bảo mật**: Kiểm tra Git commit history không chứa file `.env` hoặc API keys.
- [ ] **Kiểm tra Responsive**: F12 kiểm tra trên iPhone (375px), iPad (768px), Laptop (1366px), Desktop (1920px).
- [ ] **Lịch sử Git Commit**: Cả 5 thành viên đều có ít nhất 10 commit từ tài khoản cá nhân.
- [ ] **Đầy đủ deliverables**:
  - [ ] Website chạy live trên GitHub Pages.
  - [ ] File `GroupX.docx` (đúng format, đủ % đóng góp 20% x 5 = 100%).
  - [ ] Video demo YouTube ở chế độ **Unlisted**.
  - [ ] Báo cáo đồ án PDF (15-40 trang).
  - [ ] Slide thuyết trình (10-15 phút).
