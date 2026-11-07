# Module Tự Động Cập Nhật Tạp Chí & Special Issues (Journal Update Pipeline)

Module tự động hóa cập nhật chỉ số học thuật (Scopus Quartile Q1-Q4, CiteScore, SJR, H-index) và cào thông báo **Số đặc biệt (Special Issues / Call-for-Papers)** có hạn nộp bài cụ thể cho danh mục hơn 8,200 tạp chí thuộc dự án ScopusVenue (IE104).

---

## 1. Kiến Trúc Kỹ Thuật

- **Engine thu thập**: Sử dụng framework **Scrapling v0.5.1** với cơ chế giả lập header trình duyệt chuẩn, chống chặn bot và hỗ trợ xử lý luồng mạng bất đồng bộ.
- **Chiến lược Batch Processing**: Gom nhóm 50-100 ISSN trong một truy vấn tới OpenAlex API, giúp cập nhật toàn bộ 8,277 tạp chí chỉ trong 1-2 phút (thay vì quét 8,277 trang đơn lẻ tốn hàng giờ).
- **Trích xuất Special Issues**: Cào các thông báo Call-for-Papers số đặc biệt từ các nguồn học thuật uy tín, chuẩn hóa hạn nộp theo múi giờ Anywhere on Earth (AoE - UTC-12), tự động tích hợp vào trường `submission_deadlines` để hiển thị đồng hồ đếm ngược trên `timeline.html` và `venues.html`.
- **Bảo vệ toàn vẹn dữ liệu (Atomic Write)**: Ghi ra file tạm (`tempfile`) và thực hiện hoán đổi nguyên tử (`atomic replace`), đảm bảo file `data/jour.json` không bao giờ bị rỗng hay hỏng dữ liệu khi có sự cố mạng.

---

## 2. Hướng Dẫn Chạy Trên Máy Cục Bộ (Local)

Mở terminal tại thư mục gốc của repository:

```powershell
# 1. Cài đặt các thư viện cần thiết (nếu chưa có)
python -m pip install -r tools/journal_update/requirements.txt

# 2. Chạy toàn bộ bộ test kiểm thử tự động
python -m unittest discover -s tools/journal_update -p "test_*.py" -v

# 3. Chạy thử nghiệm chế độ an toàn (Dry-run, không ghi đè dữ liệu)
python tools/journal_update/refresh.py --limit 100 --dry-run

# 4. Chạy cập nhật thực tế
python tools/journal_update/refresh.py --batch-size 50
```

### Các tùy chọn dòng lệnh (CLI Options):
- `--limit <N>`: Chỉ xử lý N tạp chí đầu tiên (phục vụ kiểm tra nhanh).
- `--batch-size <N>`: Số lượng ISSN gom nhóm trong mỗi request (mặc định: 50).
- `--dry-run`: Chạy toàn bộ pipeline nhưng không ghi đè vào `data/jour.json`.
- `--skip-openalex`: Bỏ qua cập nhật chỉ số, chỉ cào Special Issues.
- `--skip-special-issues`: Bỏ qua Special Issues, chỉ cập nhật chỉ số học thuật.

---

## 3. Vận Hành Tự Động Trên GitHub Actions

Workflow được cấu hình tại `.github/workflows/update-journals.yml`:
- **Tần suất**: Chạy định kỳ vào ngày 1 hàng tháng (hoặc kích hoạt thủ công qua nút **Run workflow** khi có thông báo bảng xếp hạng Scopus mới).
- **Cơ chế**:
  1. Kiểm tra môi trường và chạy toàn bộ unit test (`test_*.py`).
  2. Thực thi cập nhật dữ liệu qua `refresh.py`.
  3. Nếu có thay đổi, tự động tạo Pull Request mới gửi đến nhánh chính với báo cáo chẩn đoán đính kèm.
