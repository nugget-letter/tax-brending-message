/**
 * 너겟 무료 체험 신청 폼 → 구글 스프레드시트
 *
 * 이 파일은 참고용 사본입니다. 실제로 도는 코드는 구글 Apps Script 편집기 안에 있습니다.
 * 여기서 고친 뒤에는 반드시 편집기에 붙여넣고 재배포해야 반영됩니다.
 *
 * 설치:  스프레드시트 → 확장 프로그램 → Apps Script → 이 코드 전체 붙여넣기
 * 재배포: 배포 → 배포 관리 → 연필 → 버전 "새 버전" → 배포
 *        ("새 배포"를 누르면 주소가 바뀌므로 index.html도 같이 고쳐야 합니다)
 */

// 신청이 들어오면 알림 메일을 받을 주소. 알림이 필요 없으면 "" 로 비우세요.
var NOTIFY_EMAIL = "won@nugget.im";

// 기록할 시트 이름
var SHEET_NAME = "신청";

var HEADERS = ["접수시각", "이름", "사무실", "연락처", "이메일", "동의", "유입경로"];


function doPost(e) {
  // 동시에 두 건이 들어와도 줄이 겹치지 않게 잠금
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var sheet = getSheet_();
    var p = (e && e.parameter) ? e.parameter : {};

    sheet.appendRow([
      new Date(),
      p.name   || "",
      p.office || "",
      // 앞자리 0이 사라지지 않도록 문자로 저장
      p.phone ? "'" + p.phone : "",
      p.email  || "",
      p.agree  || "",
      p.source || ""
    ]);

    notify_(p);

    return json_({ ok: true });

  } catch (err) {
    // 기록에 실패해도 신청 내용은 잃지 않도록 메일로 흘려보냄
    if (NOTIFY_EMAIL) {
      MailApp.sendEmail(NOTIFY_EMAIL,
        "[너겟] 신청 기록 실패 — 수동 확인 필요",
        "오류: " + err + "\n\n받은 값:\n" + JSON.stringify(e && e.parameter));
    }
    return json_({ ok: false, error: String(err) });

  } finally {
    lock.releaseLock();
  }
}


function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(3, 180);
    sheet.setColumnWidth(5, 200);
    sheet.setColumnWidth(7, 160);
  }
  return sheet;
}


function notify_(p) {
  if (!NOTIFY_EMAIL) return;

  MailApp.sendEmail(
    NOTIFY_EMAIL,
    "[너겟] 무료 체험 신청 - " + (p.office || "사무실명 없음"),
    [
      "이름:     " + (p.name   || "-"),
      "사무실:   " + (p.office || "-"),
      "연락처:   " + (p.phone  || "-"),
      "이메일:   " + (p.email  || "-"),
      "유입경로: " + (p.source || "-"),
      "",
      "개인정보 수집·이용 " + (p.agree || "동의 여부 미확인"),
      "",
      SpreadsheetApp.getActiveSpreadsheet().getUrl()
    ].join("\n")
  );
}


function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * 배포 전에 이 함수를 한 번 실행하면 권한 승인 창이 뜨고,
 * 시트와 알림 메일이 제대로 도는지 테스트 행이 하나 들어갑니다.
 */
function 테스트() {
  doPost({ parameter: {
    name: "테스트", office: "테스트세무회계",
    phone: "010-0000-0000", email: "test@example.com",
    agree: "동의", source: "test"
  }});
}
