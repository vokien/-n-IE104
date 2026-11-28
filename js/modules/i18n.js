// js/modules/i18n.js
// Module chuyển đổi song ngữ VI / EN độc lập (không can thiệp code cũ)

const LANG_KEY = "ie104_lang_preference";
const SUPPORTED_LANGS = ["vi", "en"];

const EXACT_DICT = {
  // === Thanh điều hướng & Header ===
  "Trang Chủ": "Home",
  "Trang chủ": "Home",
  "Giới Thiệu": "About",
  "Giới thiệu": "About",
  "Tra Cứu Hội Nghị & Tạp Chí": "Venues Directory",
  "Tra cứu danh bạ": "Directory",
  "Tra Cứu Danh Bạ": "Venues Directory",
  "Gợi Ý Theo Bản Thảo": "Paper Recommender",
  "Khuyến Nghị Bài Báo": "Paper Recommender",
  "Lịch Nộp Bài (CFP)": "CFP Timeline",
  "Lịch Trình CFP": "CFP Timeline",
  "Liên Hệ": "Contact",
  "Sơ Đồ Site": "Sitemap",
  "Thông Báo": "Notifications",
  "Mục Tiêu": "Bookmarks",
  "Chuyển đến nội dung chính": "Skip to main content",

  // === Trang chủ: Hero & Thống kê ===
  "HỆ THỐNG HỖ TRỢ XUẤT BẢN NGHIÊN CỨU KHOA HỌC": "SCIENTIFIC PUBLISHING SUPPORT SYSTEM",
  "Tra Cứu & Gợi Ý Hội Nghị / Tạp Chí Chuẩn Scopus & CORE": "Search & Recommend Scopus & CORE Academic Venues",
  "Khám phá hơn 10.000 hội nghị và tạp chí khoa học quốc tế uy tín, cập nhật hạn nộp CFP thời gian thực và nhận gợi ý nơi công bố tối ưu với giải thuật Okapi BM25.":
    "Explore over 10,000 prestigious international conferences and journals, track real-time CFP deadlines, and get optimal venue recommendations powered by Okapi BM25.",
  "Tìm hội nghị, tạp chí, từ khóa (CVPR, AI)...": "Search conferences, journals, keywords (CVPR, AI)...",
  "Tìm kiếm": "Search",
  "Gợi ý phổ biến:": "Popular:",
  "HỘI NGHỊ & TẠP CHÍ QUỐC TẾ": "INTERNATIONAL CONFERENCES & JOURNALS",
  "Dữ liệu chuẩn Scopus SJR & CORE": "Scopus SJR & CORE verified data",
  "TẠP CHÍ SCOPUS Q1 - Q4": "SCOPUS Q1 - Q4 JOURNALS",
  "Điểm CiteScore & SJR cập nhật": "Updated CiteScore & SJR scores",
  "HỘI NGHỊ CHUẨN CORE 2026": "CORE 2026 CONFERENCES",
  "Phân hạng A*, A, B, C uy tín": "Prestigious A*, A, B, C rankings",
  "MỐC DEADLINE CFP THỜI GIAN THỰC": "REAL-TIME CFP DEADLINES",
  "Đếm ngược chuẩn AoE & theo thiết bị": "AoE & local device countdown",

  // === Trang chủ: Tính năng cốt lõi ===
  "Các Tính Năng Cốt Lõi Của Hệ Thống": "Core System Features",
  "Hệ thống được thiết kế hướng nghiên cứu sinh và tác giả bài báo khoa học, giải quyết trọn vẹn từ khâu lựa chọn nơi công bố đến quản lý hạn nộp bài.":
    "Designed for researchers and academic authors, covering everything from venue selection to submission deadline management.",
  "GIẢI THUẬT NLP THUẦN": "PURE NLP ALGORITHM",
  "GIẢI THUẬT XẾP HẠNG": "RANKING ALGORITHM",
  "Khuyến Nghị Thông Minh Okapi BM25": "Smart Okapi BM25 Recommender",
  "Dán tiêu đề và tóm tắt (Abstract) bài báo của bạn. Động cơ phân tích văn bản học thuật sẽ đo lường mức độ tương quan từ vựng, tính toán":
    "Paste your paper title and abstract. Our academic text engine measures lexical relevance, computes",
  "và đề xuất top các hội nghị/tạp chí có phạm vi nghiên cứu phù hợp nhất.":
    "and recommends the top matching conferences and journals.",
  "Dán tiêu đề và tóm tắt (Abstract) bài báo của bạn. Động cơ phân tích văn bản học thuật sẽ đo lường mức độ tương quan từ vựng, tính toán Relevance Match Score (%) và đề xuất top các hội nghị/tạp chí có phạm vi nghiên cứu phù hợp nhất.":
    "Paste your paper title and abstract. Our academic text engine measures lexical relevance, computes Relevance Match Score (%), and recommends the top matching conferences and journals.",
  "Trải nghiệm gợi ý": "Try Recommender",
  "TRA CỨU TOÀN DIỆN": "COMPREHENSIVE SEARCH",
  "Tra Cứu Hội Nghị & Tạp Chí": "Conferences & Journals Directory",
  "Tra cứu nhanh trên kho dữ liệu hơn 10.000 hội nghị và tạp chí. Hỗ trợ lọc tức thời theo phân hạng Tạp chí Scopus (Q1, Q2, Q3, Q4), phân hạng Hội nghị CORE (A*, A, B, C), Chuyên ngành đào tạo, Chỉ số CiteScore/SJR và mã định danh quốc tế ISSN/eISSN.":
    "Search across 10,000+ conferences and journals. Instant filtering by Scopus Quartile (Q1–Q4), CORE Rank (A*, A, B, C), Subject Area, CiteScore/SJR, and ISSN/eISSN.",
  "Mở bộ lọc hội nghị & tạp chí": "Open venue filters",
  "MÚI GIỜ CHUẨN & THIẾT BỊ": "STANDARD & LOCAL TIMEZONE",
  "Lịch Trình Call-for-Papers (CFP)": "Call-for-Papers (CFP) Timeline",
  "Theo dõi trực quan toàn bộ các mốc quan trọng: Abstract Registration, Full Paper Submission, Notification of Acceptance và Camera-ready. Đồng hồ đếm ngược từng giây hỗ trợ song song":
    "Visually track all key milestones: Abstract Registration, Full Paper Submission, Notification of Acceptance, and Camera-ready. Real-time second-by-second countdown supporting both",
  "Theo dõi trực quan toàn bộ các mốc quan trọng:": "Visually track all key milestones:",
  "và": "and",
  "Đồng hồ đếm ngược từng giây hỗ trợ song song": "Real-time second-by-second countdown supporting both",
  "Múi giờ chuẩn hội nghị (AoE)": "Conference Standard Time (AoE)",
  "Múi giờ theo thiết bị": "Device Local Time",
  "Theo dõi trực quan toàn bộ các mốc quan trọng: Abstract Registration, Full Paper Submission, Notification of Acceptance và Camera-ready. Đồng hồ đếm ngược từng giây hỗ trợ song song Múi giờ chuẩn hội nghị (AoE) và Múi giờ theo thiết bị.":
    "Visually track key milestones: Abstract Registration, Full Paper Submission, Notification of Acceptance, and Camera-ready. Real-time countdown supporting both AoE and local device timezones.",
  "Xem timeline deadline": "View deadline timeline",
  "THÔNG TIN DỰ ÁN": "PROJECT INFO",
  "Giới Thiệu Đề Tài & Đội Ngũ Thực Hiện": "About the Project & Team",
  "Tìm hiểu chi tiết về mục tiêu đề tài, hệ thống chuẩn mực phân hạng Scopus SJR / CORE 2026, cơ chế lưu trữ bảo mật LocalStorage và thông tin phân công 5 thành viên nhóm sinh viên UIT.":
    "Learn about project goals, Scopus SJR / CORE 2026 ranking standards, LocalStorage persistence, and the 5-member UIT student team.",
  "Xem giới thiệu đề tài": "View project info",

  // === Trang chủ: Hội nghị & Tạp chí tiêu biểu ===
  "Hội Nghị & Tạp Chí Tiêu Biểu Trong Ngành": "Featured Conferences & Journals",
  "Một số địa chỉ công bố uy tín hàng đầu trong lĩnh vực Khoa học Máy tính, Trí tuệ Nhân tạo và Kỹ thuật Phần mềm.":
    "Top prestigious publishing venues in Computer Science, Artificial Intelligence, and Software Engineering.",
  "Tạp chí (Journal)": "Journal",
  "Hội nghị (Conference)": "Conference",
  "Nhà xuất bản:": "Publisher:",
  "Chuyên ngành:": "Field:",
  "Viết tắt:": "Acronym:",
  "Hạn nộp:": "Deadline:",
  "17/11/2026 (Giờ VN)": "17/11/2026 (VN Time)",
  "Tổ chức:": "Organizer:",
  "Hội nghị thường niên hàng đầu thế giới về Thị giác máy tính và Học sâu.":
    "World's leading annual conference on Computer Vision and Deep Learning.",
  "Hội nghị quy mô lớn nhất về Khai phá dữ liệu, Học máy ứng dụng và Big Data.":
    "Largest conference on Data Mining, Applied Machine Learning, and Big Data.",
  "Tạp chí tiên phong lâu đời và danh giá nhất của ngành Trí tuệ nhân tạo thế giới.":
    "The world's oldest and most prestigious pioneering journal in Artificial Intelligence.",
  "Múi giờ chuẩn": "Standard Timezone",
  "Địa điểm": "Location",
  "Chi tiết hồ sơ": "View Details",
  "Xem đồng hồ CFP": "View CFP Timer",

  // === Trang chủ: Quy trình 3 bước ===
  "Quy Trình 3 Bước Tìm Kiếm & Xuất Bản": "3-Step Search & Publishing Workflow",
  "Cách thức nhanh nhất để tìm ra hội nghị hoặc tạp chí phù hợp nhất cho công trình của bạn.":
    "The fastest way to find the best conference or journal for your research.",
  "Nhập Tiêu Đề & Abstract": "Enter Title & Abstract",
  "Chuẩn bị bản thảo nghiên cứu của bạn. Chỉ cần sao chép Tiêu đề (Title) và Tóm tắt (Abstract) cùng từ khóa quan trọng vào form khuyến nghị.":
    "Prepare your research manuscript. Simply copy your Title, Abstract, and key keywords into the recommendation form.",
  "So Khớp Thuật Toán BM25": "BM25 Algorithm Matching",
  "Thuật toán Okapi BM25 chuẩn hóa độ dài văn bản, bão hòa tần suất từ khóa học thuật và lọc ra danh sách nơi công bố có phạm vi nghiên cứu tương đồng cao nhất.":
    "Okapi BM25 normalizes document length, saturates academic keyword frequencies, and ranks venues with the highest scope similarity.",
  "Đánh Dấu & Canh Deadline": "Bookmark & Track Deadlines",
  "Lưu hội nghị hoặc tạp chí vào danh sách mục tiêu (Watchlist), kích hoạt đồng hồ đếm ngược CFP theo múi giờ chuẩn hội nghị (AoE) hoặc múi giờ thiết bị và hoàn thiện bản thảo trước hạn nộp bài.":
    "Save conferences or journals to your Watchlist, enable AoE or local CFP countdown timers, and finish your manuscript before the deadline.",

  // === Footer ===
  "Hệ thống tra cứu và khuyến nghị nơi công bố khoa học (Hội nghị CORE & Tạp chí Scopus SJR) dành cho giảng viên, nghiên cứu sinh và sinh viên.":
    "Academic venue search and recommendation system (CORE Conferences & Scopus SJR Journals) for lecturers, researchers, and students.",
  "ĐHQG-HCM · TRƯỜNG ĐH CÔNG NGHỆ THÔNG TIN": "VNU-HCM · UNIVERSITY OF INFORMATION TECHNOLOGY",
  "Đơn Vị & Học Phần": "Institution & Course",
  "Môn học:": "Course:",
  "IE104 - Internet & Công nghệ Web": "IE104 - Internet & Web Technologies",
  "Khoa:": "Faculty:",
  "Khoa học và Kỹ thuật Thông tin (ISE - UIT)": "Information Science and Engineering (ISE - UIT)",
  "GVHD:": "Advisor:",
  "ThS. Võ Tấn Khoa": "ThS. Vo Tan Khoa",
  "Địa chỉ:": "Address:",
  "KP.6, P. Linh Trung, TP. Thủ Đức, TP.HCM": "Quarter 6, Linh Trung Ward, Thu Duc City, HCMC",
  "Nhóm Sinh Viên Thực Hiện": "Project Team",
  "Võ Đình Kiên (TV1 - Trưởng nhóm)": "Vo Dinh Kien (M1 - Team Lead)",
  "Trần Duy Khánh (TV2)": "Tran Duy Khanh (M2)",
  "Huỳnh Văn Lên (TV3)": "Huynh Van Len (M3)",
  "Trần Hồng Lĩnh (TV4)": "Tran Hong Linh (M4)",
  "Ngô Bảo Lâm (TV5)": "Ngo Bao Lam (M5)",
  "Tiêu Chuẩn & Học Thuật": "Standards & Architecture",
  "Dữ liệu:": "Data:",
  "Scopus SJR & CORE 2026 (8.412 hội nghị & tạp chí)": "Scopus SJR & CORE 2026 (8,412 venues)",
  "Thuật toán:": "Algorithm:",
  "Okapi BM25 thuần Vanilla JS": "Pure Vanilla JS Okapi BM25",
  "Múi giờ CFP:": "CFP Timezone:",
  "Múi giờ chuẩn (AoE) & Múi giờ thiết bị": "AoE & Device Local Time",
  "Kiến trúc:": "Architecture:",
  "Lưu trữ:": "Storage:",
  "© 2026 ScopusVenue. Đồ án môn học IE104 - Internet và Công nghệ Web | Trường Đại học Công nghệ Thông tin - ĐHQG-HCM.":
    "© 2026 ScopusVenue. IE104 Course Project - Internet & Web Technologies | University of Information Technology - VNU-HCM.",

  // === Trang Tra cứu (Venues) & Card ===
  "Tìm nơi công bố nghiên cứu": "Find Academic Venues",
  "Tra cứu tạp chí và hội nghị theo lĩnh vực, thứ hạng và hạn nộp bài.": "Search journals and conferences by field, rank, and submission deadline.",
  "Tìm tên, chủ đề hoặc nhà xuất bản": "Search name, topic, or publisher",
  "Tạp chí": "Journal",
  "Hội nghị": "Conference",
  "Tất cả": "All",
  "Chưa có thông tin": "No information",
  "Chưa có": "N/A",
  "Chưa có hạn nộp bài": "No deadline yet",
  "Hạn nộp bài gần nhất": "Nearest deadline",
  "Website chính thức": "Official Website",
  "Xem Lịch CFP": "View CFP Timeline",
  "Đã lưu": "Saved",
  "Xóa": "Remove",
  "Trước": "Prev",
  "Sau": "Next",
  "Đặt lại bộ lọc": "Reset filters",
  "Áp dụng": "Apply",
  "Bộ lọc": "Filters",
  "Sắp xếp theo": "Sort by",
  "Lĩnh vực của tạp chí:": "Journal subject area:",
  "Lĩnh vực của hội nghị:": "Conference subject area:",

  // === Modal Mục Tiêu & Thông Báo ===
  "Mục Tiêu Đã Lưu": "Saved Bookmarks",
  "Danh sách mục tiêu": "Bookmarks list",
  "Xóa tất cả": "Clear all",
  "Xem danh sách chi tiết": "View full directory",
  "Bạn chưa lưu tạp chí hoặc hội nghị nào.": "You haven't saved any journals or conferences yet.",
  "Đóng": "Close",

  // === Trang Lịch trình CFP ===
  "Ngày": "Days",
  "Giờ": "Hours",
  "Phút": "Mins",
  "Giây": "Secs",
  "Đã hết hạn": "Expired",
  "Đang mở nhận bài": "Open for submission",
  "Sắp hết hạn": "Closing soon",

    // === Modal Thông báo ===
  "HỘI NGHỊ MỚI": "NEW CONFERENCE",
  "TẠP CHÍ MỚI": "NEW JOURNAL",
  "Vừa xong": "Just now",
  "Xem chi tiết →": "View details →",
  "Xem chi tiết": "View details",
  "Đánh dấu đã đọc": "Mark as read",
  "Đã đọc tất cả": "Mark all as read",
  "Xóa tất cả thông báo": "Clear all notifications",
  "Không có thông báo nào.": "No notifications.",
    "Tất cả (": "All (",
  "Mục tiêu của tôi (": "My Bookmarks (",
  "Mục tiêu của tôi": "My Bookmarks",
  "Hội nghị / Tạp chí mới (": "New Venues (",
  "Hội nghị / Tạp chí mới": "New Venues",

    // === Trang Tra cứu: Tiêu đề & Bộ lọc ===
  "Tra Cứu Hội Nghị & Tạp Chí Khoa Học": "Search Academic Conferences & Journals",
  "Tra cứu hội nghị xếp hạng CORE và tạp chí xếp hạng Scopus SJR theo chuyên ngành, thứ hạng và hạn nộp bài.":
    "Search CORE-ranked conferences and Scopus SJR-ranked journals by field, ranking, and submission deadline.",
  "Bộ lọc tìm kiếm": "Search Filters",
  "Loại hình": "Venue Type",
  "Loại địa điểm": "Venue Type",
  "Loại xuất bản": "Publication Type",
  "Phân hạng": "Rank",
  "Thứ hạng": "Rank",
  "Xếp hạng": "Ranking",
  "Chuyên ngành": "Subject Area",
  "Lĩnh vực": "Subject Area",
  "Hạn nộp bài": "Submission Deadline",
  "Chỉ hiện hội nghị còn hạn": "Upcoming deadlines only",
  "Còn hạn nộp bài": "Open deadlines only",
  "Có hạn nộp bài": "Has deadline",
  "Không phân hạng": "Unranked",
  "Chưa xếp hạng": "Unranked",
  "Sắp xếp": "Sort",
  "Sắp xếp:": "Sort:",
  "Mặc định": "Default",
  "Tên (A-Z)": "Name (A-Z)",
  "Tên (Z-A)": "Name (Z-A)",
  "Hạn nộp gần nhất": "Nearest deadline",
  "Thứ hạng cao nhất": "Highest rank",
  "CiteScore cao nhất": "Highest CiteScore",
  "SJR cao nhất": "Highest SJR",
  "H-index cao nhất": "Highest H-index",
  "Xóa bộ lọc": "Clear filters",
  "Đang tải dữ liệu...": "Loading data...",
  "Không tìm thấy kết quả phù hợp.": "No matching results found.",
  "Thử thay đổi từ khóa hoặc đặt lại bộ lọc.": "Try changing your keywords or resetting filters.",
    // === Bộ lọc & Ô tìm kiếm trang Tra cứu ===
  "Tìm tên, acronym, chủ đề, NXB...": "Search name, acronym, topic, publisher...",
  "Hạng Q của tạp chí": "Journal Q-Rank",
  "Hạng CORE của hội nghị": "Conference CORE Rank",
  "Phân loại khác (chỉ hội nghị)": "Other rankings (Conferences only)",
  "Chuẩn khác": "Other standards",
  "Chưa có hạng": "Unranked",
  "Lĩnh vực nghiên cứu": "Research Field",
  "Tất cả lĩnh vực": "All fields",
  "Với mục chưa có ngành, hãy tìm chủ đề bằng ô tìm kiếm phía trên.":
    "For entries without a field, search topics using the search box above.",
  // === Trang Giới thiệu (about.html) ===
  "THÔNG TIN HỌC THUẬT & DỰ ÁN": "ACADEMIC & PROJECT INFORMATION",
  "Đồ án môn học IE104 - Internet và Công nghệ Web | Trường Đại học Công nghệ Thông tin (UIT) - ĐHQG-HCM. Giảng viên hướng dẫn:":
    "IE104 Course Project - Internet & Web Technologies | University of Information Technology (UIT) - VNU-HCM. Advisor:",
  "Đồ án môn học IE104 - Internet và Công nghệ Web | Trường Đại học Công nghệ Thông tin (UIT) - ĐHQG-HCM. Giảng viên hướng dẫn: ThS. Võ Tấn Khoa.":
    "IE104 Course Project - Internet & Web Technologies | University of Information Technology (UIT) - VNU-HCM. Advisor: MSc. Vo Tan Khoa.",
  "Sứ Mệnh & Tầm Nhìn Dự Án": "Project Mission & Vision",
  "Học kỳ I / 2026": "Semester I / 2026",
  "là nền tảng số hỗ trợ các nhà nghiên cứu, giảng viên, học viên cao học và sinh viên đại học trong quá trình định vị, tra cứu và lựa chọn nơi công bố kết quả nghiên cứu khoa học thích hợp nhất (Hội nghị quốc tế / Tạp chí chuyên ngành).":
    "is a digital platform supporting researchers, lecturers, graduate students, and undergraduates in locating, searching, and selecting the most suitable academic publishing venues (International Conferences / Journals).",
  "Scopus & CORE Academic Venue Recommender là nền tảng số hỗ trợ các nhà nghiên cứu, giảng viên, học viên cao học và sinh viên đại học trong quá trình định vị, tra cứu và lựa chọn nơi công bố kết quả nghiên cứu khoa học thích hợp nhất (Hội nghị quốc tế / Tạp chí chuyên ngành).":
    "Scopus & CORE Academic Venue Recommender is a digital platform supporting researchers, lecturers, graduate students, and undergraduates in locating, searching, and selecting the most suitable academic publishing venues (International Conferences / Journals).",
  "Hệ thống giải quyết bài toán mất cân xứng thông tin, giúp tác giả nắm bắt chuẩn xác thứ hạng Scopus Quartiles (Q1-Q4), phân hạng hội nghị uy tín CORE 2026 (A*, A, B, C), hạn nộp Call for Papers (CFP) đồng bộ giữa":
    "The system solves information asymmetry, helping authors accurately track Scopus Quartiles (Q1–Q4), CORE 2026 conference rankings (A*, A, B, C), and Call for Papers (CFP) deadlines synchronized between",
  ", và tự động so khớp phạm vi bài báo qua thuật toán xử lý ngôn ngữ tự nhiên.":
    ", and automatically match paper scopes using natural language processing algorithms.",
  "và tự động so khớp phạm vi bài báo qua thuật toán xử lý ngôn ngữ tự nhiên.":
    "and automatically match paper scopes using natural language processing algorithms.",
  "Cam kết tuyệt đối không sử dụng thư viện hoặc framework CSS/JS (không Bootstrap, Tailwind, React, jQuery). Toàn bộ mã nguồn do nhóm lập trình từ đầu.":
    "Strictly zero external CSS/JS libraries or frameworks (no Bootstrap, Tailwind, React, jQuery). All source code is written from scratch by the team.",
  "Kiến Trúc Bánh Xe (Wheel)": "Wheel Architecture",
  "Tuân thủ mô hình điều hướng Hub-and-Spoke với Trang chủ (index.html) làm trục điều phối trung tâm kết nối hai chiều đến tất cả trang vệ tinh.":
    "Follows the Hub-and-Spoke navigation model with the Home page (index.html) as the central hub connecting bidirectionally to all satellite pages.",
  "Tuân thủ mô hình điều hướng Hub-and-Spoke với Trang chủ (":
    "Follows the Hub-and-Spoke navigation model with the Home page (",
  ") làm trục điều phối trung tâm kết nối hai chiều đến tất cả trang vệ tinh.":
    ") as the central hub connecting bidirectionally to all satellite pages.",
  "Thuật Toán NLP Okapi BM25": "Okapi BM25 NLP Algorithm",
  "Triển khai thuật toán so khớp độ tương đồng ngữ nghĩa BM25 thuần JavaScript phía client, tính toán điểm phù hợp trực tiếp mà không cần backend nặng nề.":
    "Implements client-side BM25 semantic similarity matching in pure JavaScript, computing relevance scores directly without a heavy backend.",

  // Đội ngũ thực hiện
  "Đội Ngũ Thực Hiện (Nhóm 5 Sinh Viên)": "Project Team (5 Students)",
  "Mỗi thành viên chịu trách nhiệm chuyên trách một phân hệ độc lập và phối hợp qua Git Workflow chuẩn.":
    "Each member is responsible for an independent module and collaborates via standard Git Workflow.",
  "5 Thành Viên": "5 Members",
  "Võ Đình Kiên": "Vo Dinh Kien",
  "MSSV: 24520893": "Student ID: 24520893",
  "Trưởng Nhóm - Trang Chủ & Lưu Trữ": "Team Lead - Home & Storage",
  "Phụ trách trang Hub index.html, cấu trúc dự án, module lưu trữ storage.js (Bookmarks & Search History), quản trị Git & GitHub Repository.":
    "In charge of the Hub page index.html, project structure, storage.js module (Bookmarks & Search History), and Git & GitHub repository management.",
  "Trần Duy Khánh": "Tran Duy Khanh",
  "MSSV: 24520798": "Student ID: 24520798",
  "Thuật Toán & Gợi Ý Bài Báo": "Algorithm & Paper Recommender",
  "Phụ trách trang gợi ý recommend.html, thuật toán xếp hạng recommender.js (Okapi BM25, Tokenizer, Stopwords), tính toán Match Score %.":
    "In charge of recommend.html, ranking algorithm recommender.js (Okapi BM25, Tokenizer, Stopwords), and Match Score % calculation.",
  "Huỳnh Văn Lên": "Huynh Van Len",
  "MSSV: 24520948": "Student ID: 24520948",
  "Dữ Liệu Hội Nghị & Tạp Chí": "Conferences & Journals Data",
  "Phụ trách chuẩn hóa tập dữ liệu conf.json & jour.json (8.412 hội nghị & tạp chí), trang tra cứu venues.html, module bộ lọc đa tiêu chí filter.js và phân trang.":
    "In charge of normalizing conf.json & jour.json datasets (8,412 venues), venues.html, multi-criteria filter.js module, and pagination.",
  "Trần Hồng Lĩnh": "Tran Hong Linh",
  "MSSV: 24520970": "Student ID: 24520970",
  "Lịch Nộp Bài CFP & Media": "CFP Timeline & Media",
  "Phụ trách trang dòng thời gian timeline.html, đồng hồ đếm ngược countdown.js (múi giờ chuẩn AoE & múi giờ theo thiết bị), nhãn trạng thái và dựng Video Demo.":
    "In charge of timeline.html, countdown.js timer (AoE & local device timezone), status badges, and Demo Video production.",
  "Ngô Bảo Lâm": "Ngo Bao Lam",
  "MSSV: 24520931": "Student ID: 24520931",
  "Giao Diện UI/UX": "UI/UX Design",
  "Phụ trách hệ thống Design Tokens variables.css, khung layout main.css, trang about.html, contact.html, 404.html và Slide thuyết trình.":
    "In charge of Design Tokens variables.css, main.css layout, about.html, contact.html, 404.html, and Presentation Slides.",

  // Chuẩn mực khoa học & công nghệ
  "Chuẩn Mực Khoa Học & Công Nghệ Áp Dụng": "Academic Standards & Technologies Applied",
  "Cơ Sở Dữ Liệu Tham Chiếu": "Reference Databases",
  "Phân chia tạp chí thành 4 phân vị (Quartiles) Q1, Q2, Q3, Q4 dựa trên mức độ trích dẫn trung bình.":
    "Categorizes journals into 4 quartiles (Q1, Q2, Q3, Q4) based on average citation impact.",
  "Hệ thống xếp hạng hội nghị quốc tế uy tín do Hiệp hội Giáo dục và Nghiên cứu Điện toán Australasia (CORE) duy trì (A*, A, B, C).":
    "Prestigious international conference ranking system maintained by the Computing Research and Education Association of Australasia (CORE) (A*, A, B, C).",
  "Hỗ trợ song song 2 múi giờ:": "Dual Timezone Support:",
  "Hệ thống kết hợp giữa": "The system combines",
  "(tự động nhận diện múi giờ máy tính), giúp các tác giả theo dõi và canh hạn nộp bài chuẩn xác mà không cần tự quy đổi thủ công.":
    "(auto-detected), helping authors track deadlines accurately without manual conversion.",
  ", giúp các tác giả theo dõi và canh hạn nộp bài chuẩn xác mà không cần tự quy đổi thủ công.":
    ", helping authors track deadlines accurately without manual timezone conversion.",
  "Hệ thống kết hợp giữa Múi giờ chuẩn hội nghị (AoE - UTC-12) và Múi giờ theo thiết bị (tự động nhận diện múi giờ máy tính), giúp các tác giả theo dõi và canh hạn nộp bài chuẩn xác mà không cần tự quy đổi thủ công.":
    "The system combines Conference Standard Time (AoE - UTC-12) and Device Local Time (auto-detected), helping authors track deadlines accurately without manual conversion.",
  "Tiêu Chuẩn Lập Trình Web": "Web Development Standards",
  "100% sử dụng đúng thẻ ngữ nghĩa (<header>, <nav>, <main>, <section>, <article>, <figure>, <footer>).":
    "100% semantic tags (<header>, <nav>, <main>, <section>, <article>, <figure>, <footer>).",
  "100% sử dụng đúng thẻ ngữ nghĩa (": "100% semantic tags (",
  "Quản lý tập trung toàn bộ màu sắc, kích thước, khoảng cách và chuyển đổi theme Light/Dark mượt mà.":
    "Centralized management of colors, sizing, spacing, and smooth Light/Dark theme switching.",
  "Tận dụng Web Storage API (localStorage) lưu trữ dữ liệu cục bộ bảo mật, không phụ thuộc máy chủ.":
    "Leverages the Web Storage API (localStorage) for secure client-side storage without server dependency.",
  "Tận dụng Web Storage API (": "Leverages the Web Storage API (",
  ") lưu trữ dữ liệu cục bộ bảo mật, không phụ thuộc máy chủ.":
    ") for secure client-side storage without server dependency.",
      "Đồ án môn học": "Course Project",
  "| Trường Đại học Công nghệ Thông tin (UIT) - ĐHQG-HCM. Giảng viên hướng dẫn:":
    "| University of Information Technology (UIT) - VNU-HCM. Advisor:",
  "Hệ thống giải quyết bài toán mất cân xứng thông tin, giúp tác giả nắm bắt chuẩn xác thứ hạng":
    "The system solves information asymmetry, helping authors accurately track",
  ", phân hạng hội nghị uy tín": ", prestigious conference rankings",
  ", hạn nộp Call for Papers (CFP) đồng bộ giữa":
    ", and Call for Papers (CFP) deadlines synchronized between",
      // === Mô tả chi tiết 5 thành viên (tách theo thẻ <strong>) ===
  "Phụ trách trang Hub": "In charge of Hub page",
  ", cấu trúc dự án, module lưu trữ": ", project structure, storage module",
  "(Bookmarks & Search History), quản trị Git & GitHub Repository.":
    "(Bookmarks & Search History), and Git & GitHub Repository management.",

  "Phụ trách trang gợi ý": "In charge of recommender page",
  ", thuật toán xếp hạng": ", ranking algorithm",
  "(Okapi BM25, Tokenizer, Stopwords), tính toán Match Score %.":
    "(Okapi BM25, Tokenizer, Stopwords), and Match Score % calculation.",

  "Phụ trách chuẩn hóa tập dữ liệu": "In charge of normalizing datasets",
  "conf.json & jour.json (8.412 hội nghị & tạp chí)": "conf.json & jour.json (8,412 venues)",
  ", trang tra cứu": ", directory page",
  ", module bộ lọc đa tiêu chí": ", multi-criteria filter module",
  "và phân trang.": "and pagination.",

  "Phụ trách trang dòng thời gian": "In charge of timeline page",
  ", đồng hồ đếm ngược": ", countdown timer",
  "(múi giờ chuẩn AoE & múi giờ theo thiết bị), nhãn trạng thái và dựng Video Demo.":
    "(AoE & local device timezone), status badges, and Demo Video production.",

  "Phụ trách hệ thống Design Tokens": "In charge of Design Tokens",
  ", khung layout": ", layout framework",
  ", trang": ", pages",
  "và Slide thuyết trình.": "and Presentation Slides.",
    // === Trang Gợi ý theo bản thảo (recommend.html) ===
  "Hệ Thống Gợi Ý Hội Nghị & Tạp Chí Thông Minh": "Smart Conference & Journal Recommender",
  "Dán tiêu đề và tóm tắt bản thảo nghiên cứu của bạn vào bên dưới. Thuật toán Okapi BM25 sẽ phân tích và xếp hạng các hội nghị / tạp chí Scopus & CORE phù hợp nhất để gửi bài.":
    "Paste your research paper title and abstract below. The Okapi BM25 algorithm will analyze and rank the most suitable Scopus & CORE conferences and journals.",
  "Thuật toán Okapi BM25": "Okapi BM25 Algorithm",
  "Đối sánh từ khóa học thuật": "Academic keyword matching",
  "Thông Tin Bản Thảo": "Manuscript Information",
  "Tiêu đề bài báo (Title) *": "Paper Title *",
  "Tiêu đề bài báo (Title)": "Paper Title",
  "VD: Deep Residual Learning...": "e.g., Deep Residual Learning...",
  "Bắt buộc. Nhập tiêu đề tiếng Anh của bài báo để so khớp từ khóa chính xác.":
    "Required. Enter the English paper title for accurate keyword matching.",
  "Tóm tắt bài báo (Abstract) *": "Paper Abstract *",
  "Tóm tắt bài báo (Abstract)": "Paper Abstract",
  "Dán đoạn tóm tắt bài báo (Abstract tiếng Anh) vào đây...":
    "Paste your English paper abstract here...",
  "Tốt nhất 100-300 từ tiếng Anh. BM25 so khớp từ khóa, không suy luận ngữ nghĩa.":
    "Best with 100–300 English words. BM25 matches keywords, not semantic inference.",
  "Từ khóa (Keywords)": "Keywords",
  "VD: computer vision, deep learning...": "e.g., computer vision, deep learning...",
  "Cách nhau bằng dấu phẩy. Bổ sung các thuật ngữ chuyên ngành để so khớp.":
    "Comma-separated. Add domain-specific terms to improve matching.",
  "Bộ lọc bổ sung (tuỳ chọn)": "Additional Filters (optional)",
  "Bộ lọc bổ sung (tùy chọn)": "Additional Filters (optional)",
  "Số kết quả hiển thị": "Results to display",
  "Phân Tích & Đề Xuất Nơi Nộp": "Analyze & Recommend Venues",
  "Sẵn sàng: 8.412 hội nghị và tạp chí.": "Ready: 8,412 conferences and journals.",
  "Kết Quả Gợi Ý Nơi Công Bố Phù Hợp Nhất": "Top Recommended Publishing Venues",
  "Nhập thông tin bản thảo ở cột bên trái và nhấn":
    "Enter your manuscript details on the left and click",
  "để xem danh sách gợi ý được xếp hạng theo thuật toán Okapi BM25.":
    "to view the ranked venue recommendations powered by Okapi BM25.",
  "Nhập thông tin bản thảo ở cột bên trái và nhấn Phân Tích & Đề Xuất Nơi Nộp để xem danh sách gợi ý được xếp hạng theo thuật toán Okapi BM25.":
    "Enter your manuscript details on the left and click Analyze & Recommend Venues to view the ranked venue recommendations powered by Okapi BM25.",
  "Mỗi kết quả hiển thị:": "Each result displays:",
  "Thanh đo điểm tương đồng (0-100%)": "Similarity score bar (0–100%)",
  "Từ khóa trùng khớp": "Matched keywords",
  "Từ khóa trùng khớp:": "Matched keywords:",
  "Xếp hạng Scopus / CORE": "Scopus / CORE Ranking",
  "Điểm phù hợp": "Match Score",
  "Độ phù hợp": "Match Score",
  "Đang phân tích...": "Analyzing...",
   "Dán tiêu đề và tóm tắt bản thảo nghiên cứu của bạn vào bên dưới. Thuật toán Okapi BM25 sẽ phân tích và xếp hạng các hội nghị / tạp chí":
    "Paste your research paper title and abstract below. The Okapi BM25 algorithm will analyze and rank the most suitable",
  "sẽ phân tích và xếp hạng các hội nghị / tạp chí Scopus & CORE phù hợp nhất để gửi bài.":
    "will analyze and rank the most suitable Scopus & CORE conferences and journals.",
  "sẽ phân tích và xếp hạng các hội nghị / tạp chí Scopus &":
    "will analyze and rank the most suitable Scopus &",
      "Dán tiêu đề và tóm tắt bản thảo nghiên cứu của bạn vào bên dưới. Thuật toán":
    "Paste your research paper title and abstract below. The",
      "Tiêu đề bài báo": "Paper Title",
  "Tóm tắt bài báo": "Paper Abstract",
  "Từ khóa": "Keywords",
    "để xem danh sách gợi ý được xếp hạng theo thuật toán":
    "to view the ranked venue recommendations powered by",
      // === Trang Lịch trình CFP (timeline.html) ===
  "Lịch Trình Nộp Bài & Đếm Ngược Thời Gian Thực": "Submission Timeline & Real-Time Countdown",
  "Theo dõi các mốc quan trọng (Abstract, Full Paper, Notification) của các hội nghị quốc tế đồng bộ linh hoạt giữa":
    "Track key milestones (Abstract, Full Paper, Notification) of international conferences dynamically synchronized between",
  "Theo dõi các mốc quan trọng (Abstract, Full Paper, Notification) của các hội nghị quốc tế đồng bộ linh hoạt giữa Múi giờ chuẩn hội nghị (AoE) và Múi giờ theo thiết bị.":
    "Track key milestones (Abstract, Full Paper, Notification) of international conferences dynamically synchronized between Conference Standard Time (AoE) and Device Local Time.",
  "Múi giờ hiển thị:": "Display Timezone:",
  "Múi giờ theo hội nghị (AoE - UTC-12)": "Conference Timezone (AoE - UTC-12)",
  "DEADLINE GẦN NHẤT": "NEAREST DEADLINE",
  "Xem quy trình 3 mốc CFP của hội nghị này bên dưới":
    "View this conference's 3-milestone CFP workflow below",
  "Lộ Trình Nộp Bài Chi Tiết": "Detailed Submission Roadmap",
  "Quy Trình 3 Mốc CFP Của:": "3-Milestone CFP Workflow for:",
  "Chi tiết quy trình 3 mốc nộp bài và thông báo kết quả của hội nghị":
    "Detailed 3-milestone submission and notification workflow for",
  "đang được theo dõi ở trên.": "tracked above.",
  "Chưa công bố": "TBA",
  "Đăng ký tiêu đề, danh sách tác giả và tóm tắt bài báo lên hệ thống phản biện.":
    "Register paper title, author list, and abstract on the review system.",
  "Nộp toàn văn bản thảo nghiên cứu hoàn chỉnh (Double-blind review).":
    "Submit the complete full-text research manuscript (Double-blind review).",
  "Hội đồng khoa học chưa công bố ngày thông báo kết quả chấp nhận bài báo.":
    "The program committee has not yet announced the acceptance notification date.",
  "Dòng Thời Gian Các Mốc Nộp Bài Trong Năm": "Annual Submission Milestones Timeline",
  "Đang mở nhận abstract": "Open for abstract",
  "Chờ công bố kết quả": "Awaiting notification",
  "Xem chi tiết 3 mốc CFP": "View 3 CFP milestones",
    "Đăng ký tiêu đề, thông tin tác giả và bản tóm tắt bài báo.":
    "Register paper title, author details, and abstract.",
  "Nộp toàn văn bản thảo nghiên cứu hoàn chỉnh để phản biện kín.":
    "Submit the complete full-text manuscript for double-blind review.",
  "Ban tổ chức chưa ấn định ngày công bố kết quả xét duyệt.": 
    "The organizers have not yet set the acceptance notification date.",
      "Thu gọn 3 mốc CFP": "Collapse 3 CFP milestones",
  "Không có": "None",
  "Không có vòng nộp abstract": "No abstract round",
  "Hội nghị không mở vòng tóm tắt; nộp thẳng toàn văn bản thảo.":
    "No abstract submission round; submit the full manuscript directly.",
  "Hội đồng công bố kết quả xét duyệt và gửi phiếu phản biện.":
    "The committee announces acceptance decisions and sends review feedback.",
    "ĐÃ ĐÓNG NHẬN ABSTRACT" : "CLOSED",
      // === Trang Liên hệ (contact.html) ===
  "KẾT NỐI & PHẢN HỒI Ý KIẾN": "CONNECT & FEEDBACK",
  "Liên Hệ & Đóng Góp Ý Kiến": "Contact & Feedback",
  "Mọi ý kiến đóng góp từ các nhà nghiên cứu, tác giả và cộng đồng sinh viên giúp cơ sở dữ liệu ScopusVenue ngày một hoàn thiện và chính xác hơn.":
    "All feedback from researchers, authors, and students helps make the ScopusVenue database more complete and accurate.",
  "Mọi ý kiến đóng góp từ các nhà nghiên cứu, tác giả và cộng đồng sinh viên giúp cơ sở dữ liệu":
    "All feedback from researchers, authors, and students helps make the",
  "ngày một hoàn thiện và chính xác hơn.": "database more complete and accurate.",

  "Kênh Tiếp Nhận": "Contact Channels",
  "Chúng tôi trân trọng các đóng góp về việc cập nhật deadline hội nghị, bổ sung tạp chí chuẩn Scopus hoặc hiệu chỉnh thuật toán so khớp.":
    "We appreciate contributions on updating conference deadlines, adding Scopus journals, or refining the matching algorithm.",
  "Địa Chỉ Trực Tiếp": "Direct Address",
  "Khu phố 6, P. Linh Trung, TP. Thủ Đức, TP. Hồ Chí Minh.":
    "Quarter 6, Linh Trung Ward, Thu Duc City, Ho Chi Minh City.",
  "Trường Đại học Công nghệ Thông tin (UIT) - ĐHQG-HCM":
    "University of Information Technology (UIT) - VNU-HCM",
  "Email Học Thuật": "Academic Email",
  "(ThS. Võ Tấn Khoa - GVHD)": "(MSc. Vo Tan Khoa - Advisor)",
  "Mã Nguồn Mở & Issues": "Open Source & Issues",
  "Tạo Issue hoặc Pull Request trực tiếp tại:": "Create an Issue or Pull Request directly at:",
  "Quy trình phản hồi:": "Review process:",
  "Các đề xuất bổ sung hội nghị / tạp chí sẽ được nhóm kiểm tra chéo trên cơ sở dữ liệu Scopus Preview và cổng CORE Portal trước khi cập nhật vào cơ sở dữ liệu conf.json & jour.json (8.412 hội nghị & tạp chí).":
    "Proposed conference or journal additions will be cross-checked against Scopus Preview and the CORE Portal before updating conf.json & jour.json (8,412 venues).",
  "Các đề xuất bổ sung hội nghị / tạp chí sẽ được nhóm kiểm tra chéo trên cơ sở dữ liệu":
    "Proposed conference or journal additions will be cross-checked against",
  "và cổng": "and the",
  "trước khi cập nhật vào cơ sở dữ liệu": "before updating",
  "(8.412 hội nghị & tạp chí).": "(8,412 venues).",

  "Gửi Ý Kiến & Đề Xuất": "Send Feedback & Suggestions",
  "Vui lòng điền thông tin chi tiết vào biểu mẫu bên dưới. Các mục có dấu * là bắt buộc.":
    "Please fill in the details below. Fields marked with * are required.",
  "Vui lòng điền thông tin chi tiết vào biểu mẫu bên dưới. Các mục có dấu":
    "Please fill in the details below. Fields marked with",
  "là bắt buộc.": "are required.",
  "Họ và tên tác giả / người gửi *": "Author / Sender Full Name *",
  "Họ và tên tác giả / người gửi": "Author / Sender Full Name",
  "Ví dụ: Nguyễn Văn A": "e.g., Nguyen Van A",
  "Địa chỉ Email học thuật / cơ quan *": "Academic / Institutional Email *",
  "Địa chỉ Email học thuật / cơ quan": "Academic / Institutional Email",
  "Ưu tiên sử dụng email có đuôi .edu.vn hoặc viện nghiên cứu.":
    "Preferably use an .edu.vn or research institute email.",
  "Chủ đề đóng góp ý kiến *": "Feedback Topic *",
  "Chủ đề đóng góp ý kiến": "Feedback Topic",
  "-- Chọn phân loại chủ đề --": "-- Select a topic --",
  "Đường dẫn liên kết minh chứng (Website chính thức / CFP)":
    "Reference URL (Official Website / CFP)",
  "Nội dung chi tiết đóng góp *": "Detailed Feedback *",
  "Nội dung chi tiết đóng góp": "Detailed Feedback",
  "Mô tả nội dung góp ý hoặc thông tin cần cập nhật...":
    "Describe your feedback or the information to update...",
  "Gửi Đóng Góp Ý Kiến": "Submit Feedback",
    "Các đề xuất bổ sung hội nghị / tạp chí sẽ được nhóm kiểm tra chéo trên cơ sở dữ liệu Scopus Preview và cổng CORE Portal trước khi cập nhật vào cơ sở dữ liệu":
    "Proposed conference or journal additions will be cross-checked against Scopus Preview and the CORE Portal before updating",
      "Chúng tôi trân trọng các đóng góp về việc cập nhật deadline hội nghị, bổ sung tạp chí mới chuẩn Scopus hoặc hiệu chỉnh thuật toán so khớp.":
    "We appreciate contributions on updating conference deadlines, adding new Scopus journals, or refining the matching algorithm.",
      "Danh Sách Hội Nghị & Tạp Chí": "Conferences & Journals List",
        "Tên A-Z": "Name A-Z",
  "Tên Z-A": "Name Z-A",
    "Hạn nộp bài xa nhất": "Farthest deadline",
      "Hạn nộp toàn văn (Full Paper)": "Full Paper Deadline",
  "Hạn nộp tóm tắt (Abstract)": "Abstract Deadline",
  "Giờ thiết bị:": "Local time:",
  "Giờ hội nghị:": "Conference time:",
  "Tiến trình CFP →": "CFP Timeline →",
  "Tiến trình CFP": "CFP Timeline",
};

const REGEX_DICT = [
  [/^Chủ đề nghiên cứu \((\d+)\)$/, "Research topics ($1)"],
  [/^Rank:\s*(.+)$/, "Rank: $1"],
  [/^Hiển thị\s+([\d.,]+)\s*[-–]\s*([\d.,]+)\s+trong tổng số\s+([\d.,]+)\s+kết quả$/i, "Showing $1 - $2 of $3 results"],
  [/^Tìm thấy\s+([\d.,]+)\s+kết quả$/i, "Found $1 results"],
  [/^Trang\s+(\d+)\s*\/\s*(\d+)$/i, "Page $1 / $2"],
  [/^Lưu\s+(.+)$/, "Save $1"],
  [/^Website\s+(.+)\s+\(mở tab mới\)$/, "Website $1 (opens in new tab)"],
  [/^Xem lịch trình CFP của\s+(.+)$/, "View CFP timeline for $1"],
  [/^Còn\s+(\d+)\s+ngày$/i, "$1 days left"],
    // === Modal Thông báo (dạng động) ===
  [/^Tất cả \((\d+)\)$/, "All ($1)"],
  [/^Mục tiêu của tôi \((\d+)\)$/, "My Bookmarks ($1)"],
  [/^Hội nghị \/ Tạp chí mới \((\d+)\)$/, "New Venues ($1)"],
  [/^(\d+)\s+phút trước$/i, "$1 mins ago"],
  [/^(\d+)\s+giờ trước$/i, "$1 hours ago"],
  [/^(\d+)\s+ngày trước$/i, "$1 days ago"],
  [/^Hội nghị quốc tế mới được bổ sung:\s*(.+)$/, "New international conference added: $1"],
  [/^Tạp chí quốc tế mới được bổ sung:\s*(.+)$/, "New international journal added: $1"],
  [
    /^Hệ thống vừa cập nhật hội nghị mới "(.+)" \((.+)\) với hạn nộp bài:\s*Chưa công bố\.?$/,
    'New conference "$1" ($2) has been added. Deadline: TBA.',
  ],
  [
    /^Hệ thống vừa cập nhật hội nghị mới "(.+)" \((.+)\) với hạn nộp bài:\s*(.+?)\.?$/,
    'New conference "$1" ($2) has been added. Deadline: $3.',
  ],
    [/^Tìm tên,\s*acronym,\s*chủ đề,\s*NXB.*$/i, "Search name, acronym, topic, publisher..."],
      [/^Sẵn sàng:\s*([\d.,]+)\s+hội nghị và tạp chí\.?$/, "Ready: $1 conferences and journals."],
  [/^Tìm thấy\s+(\d+)\s+gợi ý phù hợp$/i, "Found $1 matching recommendations"],
    [/^(.*?)Thanh đo điểm tương đồng \(0-100%\)(.*)$/i, "$1Similarity score bar (0–100%)$2"],
  [/^(.*?)Từ khóa trùng khớp(.*)$/i, "$1Matched keywords$2"],
    // === Trang Lịch trình CFP (dạng động) ===
  [/^Múi giờ của thiết bị:\s*(.+?)\s*-\s*Tự động$/i, "Device Timezone: $1 - Auto"],
  [/^Múi giờ của thiết bị:\s*(.+)$/i, "Device Timezone: $1"],
  [/^Quy Trình 3 Mốc CFP Của:\s*(.+)$/i, "3-Milestone CFP Workflow for: $1"],
  [
    /^Hạn nộp \((.+?)\):\s*lúc\s*(\d{1,2}:\d{2})\s+(\d{1,2})\s+tháng\s+(\d{1,2}),\s*(\d{4})\s*(.*)$/i,
    "Deadline ($1): at $2 on $3/$4/$5 $6",
  ],
  [
    /^Chi tiết quy trình 3 mốc nộp bài và thông báo kết quả của hội nghị\s+"(.+?)"\s*\((.+?)\)\s*đang được theo dõi ở trên\.?$/i,
    'Detailed 3-milestone submission and notification workflow for "$1" ($2) tracked above.',
  ],
  [
    /^Hạn chót \[(.+?)\]:\s*(\d{1,2})\s+tháng\s+(\d{1,2}),\s*(\d{4})\s*(.*)$/i,
    "Deadline [$1]: $2/$3/$4 $5",
  ],
  [
    /^Ngày công bố kết quả \[(.+?)\]:\s*(\d{1,2})\s+tháng\s+(\d{1,2}),\s*(\d{4})\s*(.*)$/i,
    "Notification [$1]: $2/$3/$4 $5",
  ],
    [/^Hạn nộp \((.+?)\):$/i, "Deadline ($1):"],
  [/^lúc\s*(\d{1,2}:\d{2})\s+(\d{1,2})\s+tháng\s+(\d{1,2}),\s*(\d{4})\s*(.*)$/i, "at $1 on $2/$3/$4 $5"],
    // === Đồng bộ động theo số lượng dữ liệu thật ===
  [/^([\d.,]+)\s+kết quả\s*·\s*Hiển thị\s+([\d.,]+)\s*[-–]\s*([\d.,]+)$/i, "$1 results · Showing $2-$3"],
  [/^([\d.,]+)\s+kết quả$/i, "$1 results"],
  [/^conf\.json & jour\.json \(([\d.,]+) hội nghị & tạp chí\)$/i, "conf.json & jour.json ($1 venues)"],
  [/^\(([\d.,]+) hội nghị & tạp chí\)\.?$/i, "($1 venues)."],
  [/^Scopus SJR & CORE 2026 \(([\d.,]+) hội nghị & tạp chí\)$/i, "Scopus SJR & CORE 2026 ($1 venues)"],
    [/^Còn\s+(.+)$/i, "$1 left"],
];
const LOWER_DICT = Object.fromEntries(
  Object.entries(EXACT_DICT).map(([k, v]) => [k.toLowerCase(), v])
);
const originalTextMap = new WeakMap();
const originalAttrMap = new WeakMap();
const ATTRS_TO_TRANSLATE = ["placeholder", "title", "aria-label"];

let currentLang = getSavedLang();
let originalTitle = document.title;
let isApplying = false;
let observer = null;

function getSavedLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    return SUPPORTED_LANGS.includes(saved) ? saved : "vi";
  } catch {
    return "vi";
  }
}

function saveLang(lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Bỏ qua nếu trình duyệt chặn localStorage
  }
}

function translateString(raw, parentEl = null) {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) return raw;

  const lower = normalized.toLowerCase();
  if (lower === "lưu") {
    if (parentEl && parentEl.closest("button, .btn, .directory-button, .bookmark-btn")) {
      return "Save";
    }
    return raw;
  }

  if (Object.prototype.hasOwnProperty.call(EXACT_DICT, normalized)) {
    return EXACT_DICT[normalized];
  }
  if (Object.prototype.hasOwnProperty.call(LOWER_DICT, lower)) {
    return LOWER_DICT[lower];
  }
  for (const [pattern, replacement] of REGEX_DICT) {
    if (pattern.test(normalized)) {
      return normalized.replace(pattern, replacement);
    }
  }
  return raw;
}

function shouldSkipNode(node) {
  const parent = node.parentElement;
  if (!parent) return true;
  const tag = parent.tagName;
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEXTAREA" || tag === "CODE" || tag === "PRE") {
    return true;
  }
  if (parent.closest("#lang-toggle-btn")) return true;
  return false;
}

function processTextNode(node, lang) {
  if (shouldSkipNode(node)) return;

  if (!originalTextMap.has(node)) {
    originalTextMap.set(node, node.nodeValue);
  }

  const orig = originalTextMap.get(node);
  if (lang === "vi") {
    if (node.nodeValue !== orig) {
      node.nodeValue = orig;
    }
    return;
  }

  const match = orig.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match || !match[2].trim()) return;

  const translated = translateString(match[2], node.parentElement);
  if (translated !== match[2]) {
    const nextVal = `${match[1]}${translated}${match[3]}`;
    if (node.nodeValue !== nextVal) {
      node.nodeValue = nextVal;
    }
  }
}

function processElementAttrs(el, lang) {
  if (!el || el.nodeType !== 1) return;
  if (el.id === "lang-toggle-btn") return;

  let savedAttrs = originalAttrMap.get(el);
  if (!savedAttrs) {
    savedAttrs = {};
    originalAttrMap.set(el, savedAttrs);
  }

  for (const attr of ATTRS_TO_TRANSLATE) {
    if (!el.hasAttribute(attr)) continue;
    if (!(attr in savedAttrs)) {
      savedAttrs[attr] = el.getAttribute(attr);
    }
    const orig = savedAttrs[attr];
    if (lang === "vi") {
      if (el.getAttribute(attr) !== orig) el.setAttribute(attr, orig);
    } else {
      const translated = translateString(orig, el);
      if (translated !== orig && el.getAttribute(attr) !== translated) {
        el.setAttribute(attr, translated);
      }
    }
  }
}

function applyLanguageToSubtree(root, lang) {
  if (!root) return;

  if (root.nodeType === 3) {
    processTextNode(root, lang);
    return;
  }

  if (root.nodeType === 1) {
    processElementAttrs(root, lang);
    const allElements = root.querySelectorAll("*");
    for (const el of allElements) {
      processElementAttrs(el, lang);
    }
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    processTextNode(node, lang);
  }
}

function observeBody() {
  if (!observer || !document.body) return;
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function applyLanguage(lang) {
  isApplying = true;
  if (observer) observer.disconnect();
  try {
    document.documentElement.lang = lang;
    if (lang === "vi") {
      document.title = originalTitle;
    } else {
      const translatedTitle = translateString(originalTitle);
      if (translatedTitle !== originalTitle) document.title = translatedTitle;
    }

    applyLanguageToSubtree(document.body, lang);
    updateLangButtonUI();
  } finally {
    if (observer) {
      observer.takeRecords();
      observeBody();
    }
    isApplying = false;
  }
}

function updateLangButtonUI() {
  const btn = document.getElementById("lang-toggle-btn");
  if (!btn) return;
  const label = btn.querySelector(".lang-code");
  if (label) {
    label.textContent = currentLang === "vi" ? "VI" : "EN";
  }
  btn.setAttribute(
    "aria-label",
    currentLang === "vi" ? "Chuyển sang tiếng Anh" : "Switch to Vietnamese"
  );
  btn.setAttribute(
    "title",
    currentLang === "vi" ? "Chuyển sang tiếng Anh (EN)" : "Switch to Vietnamese (VI)"
  );
}

function ensureLangButton() {
  if (document.getElementById("lang-toggle-btn")) return;

  const themeBtn =
    document.getElementById("theme-toggle-btn") ||
    document.querySelector(".theme-toggle-btn, [aria-label*='giao diện'], [title*='giao diện']");

  const container = themeBtn?.parentElement || document.querySelector(".header-actions");
  if (!container) return;

  const btn = document.createElement("button");
  btn.id = "lang-toggle-btn";
  btn.type = "button";
  btn.className = "btn-icon lang-toggle-btn";
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
    </svg>
    <span class="lang-code">VI</span>
  `;

  btn.addEventListener("click", () => {
    currentLang = currentLang === "vi" ? "en" : "vi";
    saveLang(currentLang);
    applyLanguage(currentLang);
    window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang: currentLang } }));
  });

  if (themeBtn) {
    container.insertBefore(btn, themeBtn);
  } else {
    container.appendChild(btn);
  }

  updateLangButtonUI();
}

function startObserver() {
  if (observer || !document.body) return;
  observer = new MutationObserver((mutations) => {
    if (isApplying || currentLang === "vi") return;
    isApplying = true;
    observer.disconnect();
    try {
      for (const m of mutations) {
        if (m.type === "characterData") {
          if (!shouldSkipNode(m.target)) {
            originalTextMap.set(m.target, m.target.nodeValue);
            processTextNode(m.target, currentLang);
          }
        } else if (m.type === "childList") {
          for (const added of m.addedNodes) {
            applyLanguageToSubtree(added, currentLang);
          }
        }
      }
    } finally {
      observer.takeRecords();
      observeBody();
      isApplying = false;
    }
  });

  observeBody();
}

function initI18n() {
  ensureLangButton();
  applyLanguage(currentLang);
  startObserver();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initI18n);
} else {
  initI18n();
}

window.AppI18n = {
  getLang: () => currentLang,
  setLang: (lang) => {
    if (!SUPPORTED_LANGS.includes(lang)) return;
    currentLang = lang;
    saveLang(lang);
    applyLanguage(lang);
  },
  refresh: () => applyLanguage(currentLang),
};