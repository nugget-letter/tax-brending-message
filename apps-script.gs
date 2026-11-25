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

var HEADERS = ["접수시각", "이름", "사무실", "연락처", "이메일", "동의", "유입경로", "어드민 전송", "알림톡 전송"];

// 신청을 어드민(tax-auto)에도 함께 보낸다. 시트는 그대로 남기고 어드민이 추가로
// 받는 구조라, 전송이 실패해도 신청 자체는 시트와 알림 메일로 남는다.
var ADMIN_ENDPOINT = "https://tax-auto.vercel.app/api/submissions";

// 어드민이 요구하는 공유 토큰. 코드에 박아두지 않고 스크립트 속성에서 읽는다.
// 설정: Apps Script 편집기 → 프로젝트 설정 → 스크립트 속성 →
//       속성 SUBMISSION_TOKEN, 값은 Vercel 환경변수와 같은 문자열
function adminToken_() {
  return PropertiesService.getScriptProperties().getProperty("SUBMISSION_TOKEN") || "";
}

// 솔라피(Solapi) 알림톡 발송 설정. 전부 스크립트 속성에서 읽는다 — 코드에 키를
// 박아두지 않기 위해서다. 설정: Apps Script 편집기 → 프로젝트 설정 → 스크립트 속성
//   SOLAPI_API_KEY       솔라피 콘솔 → API Key 관리
//   SOLAPI_API_SECRET    같은 화면의 API Secret
//   SOLAPI_PFID          카카오톡 채널 발신 프로필 키 (pfId)
//   SOLAPI_TEMPLATE_ID   승인된 알림톡 템플릿 코드
//   SOLAPI_SENDER_PHONE  솔라피에 등록한 발신번호 (알림톡 실패 시 대체 문자 발송용)
//   SOLAPI_GUIDE_URL     세팅 가이드 노션 페이지 URL (대체 문자에만 쓰임, 선택)
// 템플릿이 아직 승인되지 않았다면 속성을 비워두면 된다 — 아래 sendAlimtalk_가
// "미설정"을 돌려줄 뿐 신청 처리 자체는 그대로 계속된다.
function solapiConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    apiKey:      props.getProperty("SOLAPI_API_KEY"),
    apiSecret:   props.getProperty("SOLAPI_API_SECRET"),
    pfId:        props.getProperty("SOLAPI_PFID"),
    templateId:  props.getProperty("SOLAPI_TEMPLATE_ID"),
    senderPhone: props.getProperty("SOLAPI_SENDER_PHONE"),
    guideUrl:    props.getProperty("SOLAPI_GUIDE_URL")
  };
}


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
      p.source || "",
      ""
    ]);
    var row = sheet.getLastRow();

    notify_(p);

    // 어드민 전송과 알림톡 발송은 시트 기록이 끝난 뒤에 한다 — 여기서 뭐가
    // 터지든 위의 기록과 알림은 이미 끝나 있어서 신청이 사라지지 않는다.
    sheet.getRange(row, 8).setValue(sendToAdmin_(p));
    sheet.getRange(row, 9).setValue(sendAlimtalk_(p));

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
    sheet.setColumnWidth(8, 110);
    sheet.setColumnWidth(9, 110);
  }
  return sheet;
}


/**
 * 어드민에 신청을 보내고, 시트에 적을 상태 문자열을 돌려준다.
 * 성공이든 실패든 예외를 밖으로 던지지 않는다 — 이 호출 때문에 신청 처리가
 * 깨지면 안 되기 때문이다.
 */
function sendToAdmin_(p) {
  var token = adminToken_();
  if (!token) return "미설정";

  try {
    var res = UrlFetchApp.fetch(ADMIN_ENDPOINT, {
      method: "post",
      contentType: "application/json",
      headers: { "x-submission-token": token },
      payload: JSON.stringify({
        name:   p.name   || "",
        office: p.office || "",
        phone:  p.phone  || "",
        email:  p.email  || "",
        // 어드민은 boolean true만 동의로 인정한다. 동의 없이 들어온 신청은
        // 어드민이 400으로 거절하고, 그 사실이 시트의 "어드민 전송" 칸에 남는다.
        consented: (p.agree || "").indexOf("동의") === 0,
        source: p.source ? "tax-sales / " + p.source : "tax-sales"
      }),
      muteHttpExceptions: true
    });

    var code = res.getResponseCode();
    if (code === 201) return "o";
    return "실패: " + code + " " + res.getContentText().slice(0, 100);

  } catch (err) {
    return "실패: " + String(err).slice(0, 100);
  }
}


/**
 * 솔라피 알림톡 발송. API Key/Secret은 HMAC-SHA256으로 서명해서 보낸다
 * (솔라피 인증 방식). 템플릿이 아직 없거나 속성이 비어 있으면 "미설정"을
 * 돌려주고 조용히 넘어간다 — sendToAdmin_과 같은 이유로, 이 호출 때문에
 * 신청 처리가 깨지면 안 되기 때문이다.
 *
 * 솔라피에 등록할 템플릿 (변수명은 아래 variables와 반드시 일치):
 *   #{신청자}님, 코넥트 무료 체험 신청이 접수됐습니다.
 *
 *   ■ 신청 정보
 *   - 사무실: #{사무실}
 *
 *   아래 '세팅 가이드 보기' 버튼을 눌러 무료 체험 신청의 마지막 과정을 진행해주세요.
 *   관리자 설정까지 마무리해야 한 달 무료 체험이 시작돼요.
 *   완료되면 코넥트가 확인 후 무료 체험 전 안내 연락을 드릴게요.
 *
 *   어려운 점이 있다면 '문의하기' 버튼을 통해 언제든 문의해주세요.
 *
 *   버튼: [세팅 가이드 보기] 웹링크 → https://airy-pig-79d.notion.site/4220d43d16f981158fdee80cb7b89c1e?source=copy_link
 *         [문의하기] 웹링크 → http://pf.kakao.com/_axggwX/chat
 */
function sendAlimtalk_(p) {
  var cfg = solapiConfig_();
  if (!cfg.apiKey || !cfg.apiSecret || !cfg.pfId || !cfg.templateId || !cfg.senderPhone) {
    return "미설정";
  }

  var to = (p.phone || "").replace(/[^0-9]/g, "");
  if (!to) return "연락처 없음";

  try {
    var date = new Date().toISOString();
    var salt = Utilities.getUuid();
    var signature = Utilities.computeHmacSha256Signature(date + salt, cfg.apiSecret)
      .map(function (b) {
        var hex = ((b < 0 ? b + 256 : b)).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("");

    var res = UrlFetchApp.fetch("https://api.solapi.com/messages/v4/send", {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: "HMAC-SHA256 apiKey=" + cfg.apiKey + ", date=" + date + ", salt=" + salt + ", signature=" + signature
      },
      payload: JSON.stringify({
        message: {
          to: to,
          from: cfg.senderPhone,
          kakaoOptions: {
            pfId: cfg.pfId,
            templateId: cfg.templateId,
            // 승인된 템플릿의 변수명과 반드시 동일해야 한다.
            variables: {
              "#{신청자}": p.name || "",
              "#{사무실}": p.office || ""
            },
            // 알림톡이 실패하면(채널 미친구 추가 등) 같은 내용을 문자로 대체 발송
            disableSms: false
          },
          text: (p.name || "고객") + "님, 코넥트 무료 체험 신청이 접수됐습니다. 관리자 설정까지 마무리해야 한 달 무료 체험이 시작돼요."
            + (cfg.guideUrl ? " 세팅 가이드: " + cfg.guideUrl : "")
        }
      }),
      muteHttpExceptions: true
    });

    var code = res.getResponseCode();
    if (code === 200 || code === 201) return "o";
    return "실패: " + code + " " + res.getContentText().slice(0, 100);

  } catch (err) {
    return "실패: " + String(err).slice(0, 100);
  }
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
