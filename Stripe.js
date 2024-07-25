// Stripe API
var STRIPE_SECRET_KEY = 'Stripeのシークレットキー';

// メイン関数
function getStripePayments() {
  var oneYearAgo = Math.floor(Date.now() / 1000 - 365 * 24 * 60 * 60);
  var sheet = getOrCreateSheet('決済情報');
  initializeSheet(sheet);

  var row = 2;
  var hasMore = true;
  var lastId = null;

  while (hasMore) {
    var url = buildStripeUrl(oneYearAgo, lastId);
    var options = buildRequestOptions();

    try {
      var response = UrlFetchApp.fetch(url, options);
      var data = JSON.parse(response.getContentText());

      if (response.getResponseCode() !== 200) {
        handleApiError(data);
      }

      data.data.forEach(function(intent) {
        var paymentData = extractPaymentData(intent);
        writeToSheet(sheet, row, paymentData);
        row++;
        lastId = intent.id;
      });

      hasMore = data.has_more;
      Utilities.sleep(1000);

    } catch (e) {
      handleError(e);
    }
  }

  sheet.autoResizeColumns(1, 6);
}

// シートを取得または作成
function getOrCreateSheet(sheetName) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  return sheet;
}

// シートの初期化
function initializeSheet(sheet) {
  sheet.clear();
  sheet.getRange(1, 1, 1, 6).setValues([['時間', '金額', '決済タイトル', '決済者の氏名', 'メールアドレス', '決済ID']]);
}

// Stripe APIのURLを構築
function buildStripeUrl(oneYearAgo, lastId) {
  var url = 'https://api.stripe.com/v1/payment_intents?limit=100&created[gte]=' + oneYearAgo +
            '&expand[]=data.customer&expand[]=data.charges.data.billing_details&expand[]=data.invoice';
  if (lastId) {
    url += '&starting_after=' + lastId;
  }
  return url;
}

// リクエストオプションを構築
function buildRequestOptions() {
  return {
    'method' : 'get',
    'headers': {
      'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
      'Stripe-Version': '2020-08-27'
    },
    'muteHttpExceptions': true
  };
}


// 決済データを抽出
function extractPaymentData(intent) {
  var date = new Date(intent.created * 1000);
  var amount = intent.amount / 100;
  var description = intent.description || (intent.invoice ? intent.invoice.description : '') || '';
  var customerName = '';
  var email = '';
  var chargeId = '';

  if (intent.charges && intent.charges.data.length > 0) {
    var charge = intent.charges.data[0];
    chargeId = charge.id;
    if (charge.billing_details) {
      customerName = charge.billing_details.name || '';
      email = charge.billing_details.email || '';
    }
  }

  if (!email && intent.customer) {
    email = intent.customer.email || '';
  }

  if (!customerName && intent.customer) {
    customerName = intent.customer.name || '';
  }

  return [date, amount, description, customerName, email, chargeId];
}

// シートにデータを書き込む
function writeToSheet(sheet, row, data) {
  sheet.getRange(row, 1, 1, 6).setValues([data]);
}

// APIエラーを処理
function handleApiError(data) {
  Logger.log('APIエラー: ' + JSON.stringify(data));
  throw new Error('API request failed with status ' + response.getResponseCode());
}

// エラーを処理
function handleError(e) {
  Logger.log('エラーが発生しました: ' + e.toString());
  Logger.log('エラーの詳細: ' + JSON.stringify(e));
  throw e;
}