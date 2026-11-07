# 🎓 Scopus & CORE Academic Venue Recommender
> **Đồ án môn học: IE104 - Internet và Công nghệ Web**  
> **Trường Đại học Công nghệ Thông tin (UIT) - ĐHQG-HCM**  
> **Giảng viên hướng dẫn**: ThS. Võ Tấn Khoa  
> **Repository GitHub**: [https://github.com/vokien/-n-IE104.git](https://github.com/vokien/-n-IE104.git)  
> **Hạn chót hoàn thành**: **07/11/2026**

---

## 🌟 GIỚI THIỆU ĐỀ TÀI
Hệ thống web hỗ trợ các nhà nghiên cứu, giảng viên và sinh viên tra cứu và khuyến nghị nơi công bố khoa học tối ưu (Hội nghị / Tạp chí) dựa trên bản thảo bài báo khoa học.

### ✨ Các Tính Năng Nổi Bật:
1. **🔍 Tra Cứu Hội Nghị & Tạp Chí Đa Tiêu Chí (`venues.html`)**:
   - Lọc theo thứ hạng Scopus / SJR (**Q1, Q2, Q3, Q4**).
   - Lọc theo chuẩn xếp hạng hội nghị quốc tế **CORE 2026** (**A\*, A, B, C**).
   - Lọc theo chuyên ngành nghiên cứu (Khoa học máy tính, Trí tuệ nhân tạo, Mạng máy tính,...).
   - Phân trang (Pagination) mượt mà và tìm kiếm toàn văn theo thời gian thực.
2. **🎯 Khuyến Nghị Nơi Xuất Bản Thông Minh (`recommend.html`)**:
   - Thuật toán **Okapi BM25** ($k_1 \approx 1.2, b \approx 0.75$) thuần JavaScript phía Client-side.
   - So khớp Tiêu đề, Tóm tắt (Abstract) và Từ khóa (Keywords) của bản thảo bài báo với Scope/Aims của từng venue.
   - Trả về Top-K venue phù hợp nhất kèm thanh điểm tương đồng Match Score (%) và từ khóa học thuật trùng khớp.
3. **⏳ Dòng Thời Gian CFP & Đếm Ngược Realtime (`timeline.html`)**:
   - Đồng hồ đếm ngược từng giây đến hạn nộp bài gần nhất (Abstract, Full Paper, Acceptance, Camera-ready).
   - Hỗ trợ chuẩn **Hệ thống múi giờ kép**: **Múi giờ chuẩn hội nghị (AoE - UTC-12)** song song với **Múi giờ theo thiết bị người dùng** (tự động nhận diện theo múi giờ máy tính, có bộ chuyển đổi nhanh).
   - Nhãn trạng thái tự động: *🟢 Open* (> 30 ngày), *🟡 Warning* (7 - 30 ngày), *🔴 Urgent* (< 7 ngày), *Đã kết thúc*.
4. **❤️ Quản Lý Danh Sách Mục Tiêu Phía Client (`js/modules/bookmark-modal.js`)**:
   - Đánh dấu yêu thích (Watchlist), lưu trữ vào `localStorage` an toàn (bọc `try...catch` chống tràn bộ nhớ).
   - Hộp thoại xác nhận xóa dạng overlay phân tầng (`confirm-overlay` z-index: 1100), điều hướng cuộn mượt đến venue mục tiêu.
5. **🎨 Kiến Trúc Giao Diện Chuẩn & Zero Layout Shift**:
   - **100% Thẻ ngữ nghĩa Semantic HTML5**: `<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<aside>`, `<footer>`, `<time>`, `<figure>`, `<dialog>`.
   - **Mô hình điều hướng bánh xe (Wheel Navigation Model)**: Trang chủ `index.html` làm trục tâm (Hub), kết nối nan hoa trực tiếp 2 chiều với các trang vệ tinh và trang ngoại lệ `404.html`.
   - **Chế độ Sáng / Tối (Dark / Light Mode)** mượt mà, loại bỏ hiện tượng chớp trắng (FOUC).
6. **🤖 Tự Động Hóa Cập Nhật Dữ Liệu (CI/CD Pipeline & Scrapling)**:
   - Tự động cập nhật hội nghị định kỳ 3 ngày/lần từ CCF-Deadlines và WikiCFP.
   - Tự động cập nhật chỉ số tạp chí và cào thông báo Số đặc biệt (Special Issues) bằng **Scrapling**.
   - Vận hành ngầm qua GitHub Actions, sinh dữ liệu tĩnh và mở Pull Request tự động.

---

## 🚫 CAM KẾT RÀNG BUỘC KỸ THUẬT (100% VANILLA CODE)
* **KHÔNG** sử dụng thư viện hoặc framework CSS/JS bên ngoài (Cấm Bootstrap, Tailwind, jQuery, React, Vue, Angular,...).
* **KHÔNG** sử dụng template có sẵn tải trên mạng - 100% mã nguồn do các thành viên tự thiết kế và lập trình từ đầu.
* **KHÔNG BẮT BUỘC BACKEND**: Hệ thống hoạt động độc lập mượt mà phía Client-side qua Fetch API nạp các file dữ liệu tĩnh `data/conf.json` và `data/jour.json`.
* **CHÍNH SÁCH BẢO MẬT (NO-KEY-LEAK)**: Tuyệt đối không commit file chứa API keys, mật khẩu hoặc file môi trường (`.env`, `.env.*`) lên GitHub.

---

## 📁 CẤU TRÚC THƯ MỤC REPOSITORY
```text
.
├── .github/
│   └── workflows/
│       ├── update-conferences.yml  # CI/CD tự động cập nhật hội nghị định kỳ 3 ngày/lần
│       └── update-journals.yml     # CI/CD tự động cập nhật tạp chí & Special Issues hàng tháng
├── .gitignore                      # Loại bỏ file rác, file .env, cache, file hệ điều hành
├── README.md                       # Tài liệu tổng quan dự án và hướng dẫn chạy
├── index.html                      # Trang chủ (Hub tâm của mô hình bánh xe)
├── venues.html                     # Trang tra cứu hội nghị & tạp chí Scopus/CORE
├── recommend.html                  # Trang gợi ý nơi xuất bản theo thuật toán NLP Okapi BM25
├── timeline.html                   # Trang dòng thời gian CFP & đếm ngược deadline thời gian thực
├── about.html                      # Trang giới thiệu đề tài, phương pháp và nhóm sinh viên
├── contact.html                    # Trang form liên hệ & đóng góp ý kiến
├── 404.html                        # Trang ngoại lệ 404 và điều hướng lỗi quay về Hub
├── css/
│   ├── variables.css               # Hệ thống Design Tokens (:root, bảng màu HSL, Dark/Light)
│   ├── main.css                    # Style khung dùng chung (Header, Footer, Wheel Nav, Modal)
│   ├── venues.css                  # Style trang tra cứu hội nghị & tạp chí và bộ lọc
│   ├── recommend.css               # Style trang gợi ý bài báo và thanh điểm tương đồng
│   ├── timeline.css                # Style dòng thời gian CFP, cột mốc tiến trình và countdown
│   ├── about.css                   # Style trang giới thiệu thành viên và đề tài
│   └── contact.css                 # Style form liên hệ và phản hồi
├── js/
│   ├── main.js                     # Entry point chính của ứng dụng
│   ├── venues.js                   # Điều phối trang danh bạ, bộ lọc đa tiêu chí, phân trang
│   ├── recommender.js              # Thuật toán NLP Okapi BM25 thuần Client-side
│   ├── countdown.js                # Đồng hồ đếm ngược CFP theo múi giờ kép AoE / Thiết bị
│   └── modules/
│       ├── bookmark-modal.js       # Quản lý danh sách mục tiêu và overlay xác nhận xóa
│       ├── navigation.js           # Xử lý điều hướng mô hình bánh xe và menu di động
│       ├── storage.js              # Quản lý LocalStorage an toàn (Bookmarks, Search history)
│       ├── theme.js                # Chuyển đổi Dark/Light mode chống hiện tượng FOUC
│       └── venue-data.js           # Fetch API nạp dữ liệu conf.json & jour.json song song
├── data/
│   ├── conf.json                   # Dữ liệu hội nghị quốc tế và các vòng submission deadlines
│   └── jour.json                   # Dữ liệu hơn 8,200 tạp chí Scopus Q1-Q4 và Special Issues
├── tools/
│   ├── conference_update/          # Module Python tự động thu thập & cập nhật hội nghị (WikiCFP/CCF)
│   └── journal_update/             # Module Python tự động cập nhật tạp chí & Special Issues (Scrapling)
└── images/                         # Logo favicon SVG, vector icons, ảnh thành viên
```

---

## 📝 QUY ĐỊNH COMMIT GIT CHO CÁC THÀNH VIÊN
Để đảm bảo minh chứng đóng góp rõ ràng phục vụ chấm điểm môn học, tất cả các commit phải tuân theo cú pháp:
```bash
git commit -m "[Mã Task] Nội dung công việc thực hiện"
```
**Ví dụ mẫu:**
* `git commit -m "[T1.1] Khoi tao cau truc repo va file .gitignore chuan"`
* `git commit -m "[T2.2] Hoan thanh ham tokenizer va danh sach stopwords tieng Anh"`
* `git commit -m "[T3.2] Chuẩn hóa dữ liệu journal và tự động cập nhật hội nghị"`
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
Do dự án sử dụng 100% Vanilla HTML, CSS, JavaScript thuần (Client-side), bạn có thể:
* **Cách 1 (Khuyến nghị)**: Mở thư mục dự án bằng **VS Code**, cài extension **Live Server** và nhấn **Go Live** tại file `index.html`.
* **Cách 2**: Chạy một web server tĩnh cục bộ bằng Python:
  ```bash
  python -m http.server 5500
  ```
  Sau đó mở trình duyệt và truy cập: `http://localhost:5500`

### 3. Chạy bộ kiểm thử tự động (Unit Tests cho công cụ dữ liệu):
```bash
# Kiểm thử module cập nhật hội nghị (29 bài test)
python -m unittest discover -s tools/conference_update -p "test_*.py" -v

# Kiểm thử module cập nhật tạp chí bằng Scrapling (13 bài test)
python -m unittest discover -s tools/journal_update -p "test_*.py" -v
```
