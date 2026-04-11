// سكريبت مزامنة رصيد صندوق الإيرادات مع مجموع كل الحركات remittance
const { Client } = require('pg');

// عدّل بيانات الاتصال حسب إعداداتك
const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'superm',
  password: '123456',
  port: 5432,
});

async function syncRevenueFund() {
  try {
    await client.connect();
    const { rows } = await client.query(
      `UPDATE app_fund_accounts
       SET current_balance_iqd = (
         SELECT COALESCE(SUM(amount_iqd), 0)
         FROM app_fund_movements
         WHERE reason = 'shift-remittance'
           AND direction = 'inflow'
           AND destination_fund_account_id = app_fund_accounts.id
       )
       WHERE code = 'revenue'
       RETURNING id, current_balance_iqd;`
    );
    if (rows.length) {
      console.log('تم تحديث رصيد صندوق الإيرادات:', rows[0].current_balance_iqd);
    } else {
      console.log('لم يتم العثور على صندوق الإيرادات!');
    }
  } catch (err) {
    console.error('خطأ أثناء المزامنة:', err.message);
  } finally {
    await client.end();
  }
}

syncRevenueFund();
