const supabase = require('./src/supabase');
const payos = require('./src/payos');

async function testSupabase() {
  console.log('🔄 Đang kiểm tra kết nối Supabase...');
  try {
    // Thử truy vấn bảng users
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .limit(1);

    if (error) {
      // Nếu bảng chưa được tạo, nhưng kết nối API thành công thì vẫn ổn
      if (error.code === '42P01') {
        console.log('✅ Kết nối API Supabase THÀNH CÔNG (Nhưng bảng "users" chưa được khởi tạo. Hãy chạy script SQL khởi tạo bảng).');
      } else {
        throw error;
      }
    } else {
      console.log(`✅ Kết nối Supabase THÀNH CÔNG. Đã tìm thấy bảng "users" và đọc thành công.`);
    }
  } catch (error) {
    console.error('❌ Lỗi kết nối Supabase:', error.message);
  }
}

async function testPayOS() {
  console.log('\n🔄 Đang kiểm tra kết nối PayOS...');
  try {
    // Thử tạo một link thanh toán test mệnh giá nhỏ
    const testOrderCode = Math.floor(Date.now() + Math.random() * 100);
    const testPayment = {
      orderCode: testOrderCode,
      amount: 10000,
      description: 'Test ket noi bot',
      cancelUrl: 'https://google.com',
      returnUrl: 'https://google.com'
    };

    const res = await payos.createPaymentLink(testPayment);
    console.log('✅ Kết nối PayOS THÀNH CÔNG!');
    console.log(`🔗 Link thanh toán thử nghiệm: ${res.checkoutUrl}`);
  } catch (error) {
    console.error('❌ Lỗi kết nối PayOS:', error.message);
    console.log('Vui lòng kiểm tra lại Client ID, API Key và Checksum Key trong file .env');
  }
}

async function run() {
  console.log('=== HỆ THỐNG KIỂM TRA KẾT NỐI KHỞI ĐỘNG ===');
  await testSupabase();
  await testPayOS();
  console.log('\n=== HOÀN TẤT KIỂM TRA ===');
}

run();
