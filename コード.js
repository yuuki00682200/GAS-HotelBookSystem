function doGet(e) {
    if (e.parameter.roomType) {
      // 部屋予約ページを表示
      return HtmlService.createTemplateFromFile(e.parameter.roomType + 'Hotel')
        .evaluate()
        .setTitle(e.parameter.roomType + '予約システム')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } else {
      // 部屋選択ページを表示
      return HtmlService.createHtmlOutputFromFile('Index')
        .setTitle('ホテル予約システム')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }
  
  function getRoomUrl(roomType) {
    return ScriptApp.getService().getUrl() + '?roomType=' + encodeURIComponent(roomType);
  }
  
  function getStockInfo(roomType, option) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var roomSheet = ss.getSheetByName(roomType);
    
    if (!roomSheet) {
      throw new Error("'" + roomType + "'シートが見つかりません。");
    }
    
    var data = roomSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {  // 1行目はヘッダーとして扱う
      if (data[i][0] == option) {
        return data[i][1];  // 在庫数を返す
      }
    }
    
    throw new Error("選択されたオプションが見つかりません。");
  }
  
  function saveTempReservation(formData) {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var roomSheet = ss.getSheetByName(formData.roomType);
      
      if (!roomSheet) {
        throw new Error("'" + formData.roomType + "'シートが見つかりません。");
      }
      
      var tempSheet = ss.getSheetByName('一時予約') || ss.insertSheet('一時予約');
      
      // 在庫確認
      var data = roomSheet.getDataRange().getValues();
      var optionRow = -1;
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] == formData.option) {
          optionRow = i + 1;
          break;
        }
      }
      
      if (optionRow === -1) {
        throw new Error("選択されたオプションが見つかりません。");
      }
      
      var stock = data[optionRow - 1][1];
      
      if (stock > 0) {
        // 予約ID生成（例：現在のタイムスタンプを使用）
        var reservationId = new Date().getTime().toString();
        
        // 在庫がある場合、一時予約情報を保存
        var newRow = tempSheet.appendRow([
          new Date(),
          formData.roomType,
          formData.option,
          formData.guests,
          formData.name,
          formData.email,
          formData.phone,
          'pending',
          reservationId  // 新しい列に予約IDを追加
        ]);
        
        // 選択された日程の在庫を1減らす
        roomSheet.getRange(optionRow, 2).setValue(stock - 1);
  
        // 選択された日程の日付を取得
        var selectedDates = extractDates(formData.option);
  
        // 他の日程の在庫も確認し、必要に応じて減らす
        for (var i = 1; i < data.length; i++) {
          if (i + 1 !== optionRow) {
            var otherOption = data[i][0];
            var otherStock = data[i][1];
            var otherDates = extractDates(otherOption);
            
            if (datesOverlap(selectedDates, otherDates) && otherStock > 0) {
              roomSheet.getRange(i + 1, 2).setValue(otherStock - 1);
            }
          }
        }
        
        // Slack通知を送信
        notifySlack(newRow.getLastRow());
        
        // 確認メールを送信（仮の実装）
        sendConfirmationEmail(formData, reservationId);
        
        return {
          success: true,
          message: '一時予約が保存されました。決済ページに移動します。',
          reservationId: reservationId
        };
      } else {
        return {
          success: false,
          message: '申し訳ありません。選択された日程の在庫がありません。'
        };
      }
    } catch (error) {
      console.error('エラーが発生しました:', error);
      return {
        success: false,
        message: 'エラーが発生しました: ' + error.message
      };
    }
  }
  
  function datesOverlap(dates1, dates2) {
    // 日付が重なるかチェック
    return (dates1.checkIn < dates2.checkOut && dates2.checkIn < dates1.checkOut);
  }
  
  function extractDates(option) {
    var dates = option.match(/(\d{1,2}\/\d{1,2})/g);
    var year = new Date().getFullYear(); // 現在の年を取得
    return {
      checkIn: new Date(year + '/' + dates[0]),
      checkOut: new Date(year + '/' + dates[1])
    };
  }
  
  function notifySlack(rowIndex) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tempSheet = ss.getSheetByName('一時予約');
    
    if (!tempSheet) {
      console.error('一時予約シートが見つかりません。');
      return;
    }
  
    var rowData = tempSheet.getRange(rowIndex, 1, 1, 8).getValues()[0];
    
    // データを取得
    var reservationDate = rowData[0];
    var roomType = rowData[1];
    var checkInDate = rowData[2];
    var guests = rowData[3];
    var reservationName = rowData[4];
    var email = rowData[5];
    var phone = rowData[6];
    var status = rowData[7];
    
    // Slackに送信するメッセージを作成
    var message = "新しい一時予約が追加されました:\n" +
                  "予約日: " + reservationDate + "\n" +
                  "部屋タイプ: " + roomType + "\n" +
                  "チェックイン日: " + checkInDate + "\n" +
                  "宿泊人数: " + guests + "\n" +
                  "予約者名: " + reservationName + "\n" +
                  "メールアドレス: " + email + "\n" +
                  "電話番号: " + phone + "\n" +
                  "仮予約状況: " + status;
    
    // Slackに通知を送信
    sendToSlack(message);
  }
  
  function sendToSlack(message) {
    var webhookUrl = "SlackのWebhook URL";
    
    var payload = {
      "text": message
    };
    
    var options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(payload)
    };
    
    try {
      var response = UrlFetchApp.fetch(webhookUrl, options);
      if (response.getResponseCode() == 200) {
        console.log('Slack通知が正常に送信されました。');
      } else {
        console.error('Slack通知の送信に失敗しました。レスポンスコード: ' + response.getResponseCode());
      }
    } catch (error) {
      console.error('Slack通知の送信中にエラーが発生しました: ' + error.toString());
    }
  }
  
  function checkReservations() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tempSheet = ss.getSheetByName('一時予約');
    
    if (!tempSheet) {
      console.log('一時予約シートが見つかりません。');
      return;
    }
    
    var data = tempSheet.getDataRange().getValues();
    var message = "現在の予約状況:\n";
    var pendingCount = 0;
    
    for (var i = 1; i < data.length; i++) {  // 1行目はヘッダーとして扱う
      if (data[i][7] === 'pending') {  // 仮予約状況が'pending'の場合
        pendingCount++;
        message += "予約日: " + data[i][0] + ", 部屋タイプ: " + data[i][1] + ", 予約者名: " + data[i][4] + "\n";
      }
    }
    
    message += "保留中の予約数: " + pendingCount;
    
    // Slackに通知を送信
    sendToSlack(message);
  }
  
  