# Kích hoạt cập nhật hội nghị

## Trên GitHub

1. Merge `.github/workflows/update-conferences.yml` và toàn bộ thư mục
   `tools/conference_update/` vào nhánh mặc định của repo.
2. Vào **Settings → Actions → General**:
   - Cho phép chạy GitHub Actions.
   - Trong **Workflow permissions**, bật
     **Allow GitHub Actions to create and approve pull requests** rồi lưu.
3. Vào **Actions → Update conference data → Run workflow**.
   Chọn nhánh mặc định và bấm **Run workflow**.
4. Kiểm tra các job `validate` và `refresh` đều thành công.
   Nếu lỗi, mở log và artifact `conference-update-diagnostics` để kiểm tra.
5. Mở PR từ nhánh `automation/update-conferences`, kiểm tra thay đổi
   `data/conf.json` rồi merge theo quy định của repo.

Sau khi kích hoạt, lịch chạy là **3 ngày/lần, khoảng 03:17 giờ Việt Nam**,
tính từ ngày **06/11/2026**. Có thể dùng **Run workflow** để chạy ngay.

## Bật tự merge PR (tùy chọn)

1. Vào **Settings → General → Pull Requests**, bật **Allow auto-merge**.
2. Vào **Settings → Secrets and variables → Actions → Variables**, tạo biến
   `CONF_AUTO_MERGE` với giá trị `true`.
3. Hoàn tất các yêu cầu review và status check của repo để PR được merge.

## Chạy trên máy local

Mở terminal tại thư mục gốc repo và dùng Python 3.12:

```powershell
python -m pip install -r tools/conference_update/requirements.txt
python -m unittest discover -s tools/conference_update -p "test_*.py" -v
python -u tools/conference_update/refresh.py --workers 4 --max-minutes 240 --state-dir ../tv3-data-work/dataset/ConferenceAutoUpdate
```

- Khi hoàn tất, kiểm tra `data/conf.json` và báo cáo `report.json` trong thư mục cache.
- Nếu lỗi mạng hoặc hết thời gian, chạy lại lệnh cuối để tiếp tục từ checkpoint.
- Nếu gặp CAPTCHA hoặc HTTP 401/403/429, dừng và xử lý quyền truy cập trước khi chạy lại.
- Lệnh local chỉ cập nhật file, không tự commit hoặc push.
