const supabase = require('./supabase');

/**
 * Lấy hoặc tạo mới người dùng
 */
async function getOrCreateUser(tg_id, username, first_name) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('tg_id', tg_id)
    .single();

  if (error && error.code === 'PGRST116') {
    // Không tìm thấy user, tiến hành tạo mới
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        tg_id,
        username: username || '',
        first_name: first_name || '',
        balance: 0,
        role: 'user'
      })
      .select('*')
      .single();

    if (insertError) throw insertError;
    return newUser;
  } else if (error) {
    throw error;
  }

  return data;
}

/**
 * Lấy thông tin chi tiết người dùng
 */
async function getUser(tg_id) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('tg_id', tg_id)
    .single();

  if (error) return null;
  return data;
}

/**
 * Cập nhật số dư người dùng (cộng hoặc trừ)
 */
async function updateUserBalance(tg_id, amount) {
  const user = await getUser(tg_id);
  if (!user) throw new Error('Không tìm thấy người dùng');

  const newBalance = Number(user.balance) + Number(amount);
  if (newBalance < 0) throw new Error('Số dư không đủ');

  const { data, error } = await supabase
    .from('users')
    .update({ balance: newBalance })
    .eq('tg_id', tg_id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Lấy danh sách danh mục sản phẩm
 */
async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('price', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Lấy chi tiết một danh mục
 */
async function getCategory(id) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

/**
 * Lấy danh mục theo tên
 */
async function getCategoryByName(name) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('name', name)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Lấy số lượng tài khoản còn trong kho của một danh mục
 */
async function getAvailableItemsCount(category_id) {
  const { count, error } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', category_id)
    .eq('status', 'available');

  if (error) throw error;
  return count || 0;
}

/**
 * Tạo một giao dịch nạp tiền mới
 */
async function createTransaction(orderCode, tg_id, amount) {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      order_code: orderCode,
      tg_id,
      amount,
      status: 'pending'
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Lấy thông tin giao dịch bằng order_code
 */
async function getTransaction(orderCode) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('order_code', orderCode)
    .single();

  if (error) return null;
  return data;
}

/**
 * Cập nhật trạng thái giao dịch nạp tiền
 */
async function updateTransactionStatus(orderCode, status) {
  const { data, error } = await supabase
    .from('transactions')
    .update({ status })
    .eq('order_code', orderCode)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Xử lý mua hàng (Trừ tiền, chuyển trạng thái item sang sold, ghi nhận order)
 * Sử dụng optimistic control để tránh bán trùng tài khoản
 */
async function purchaseItem(tg_id, category_id) {
  // 1. Lấy thông tin user
  const user = await getUser(tg_id);
  if (!user) throw new Error('Không tìm thấy người dùng trên hệ thống.');

  // 2. Lấy thông tin danh mục
  const category = await getCategory(category_id);
  if (!category) throw new Error('Danh mục sản phẩm không tồn tại.');

  const price = Number(category.price);
  if (Number(user.balance) < price) {
    throw new Error('Số dư tài khoản không đủ để thực hiện giao dịch này.');
  }

  // 3. Lấy 1 sản phẩm còn sẵn trong kho
  const { data: items, error: itemError } = await supabase
    .from('items')
    .select('*')
    .eq('category_id', category_id)
    .eq('status', 'available')
    .limit(1);

  if (itemError) throw itemError;
  if (!items || items.length === 0) {
    throw new Error('Sản phẩm này hiện đang hết hàng. Vui lòng quay lại sau.');
  }

  const selectedItem = items[0];

  // 4. Đánh dấu tài khoản là đã bán (kiểm tra trạng thái available để tránh tranh chấp tài nguyên)
  const { data: updatedItem, error: updateItemError } = await supabase
    .from('items')
    .update({
      status: 'sold',
      buyer_id: tg_id,
      sold_at: new Date().toISOString()
    })
    .eq('id', selectedItem.id)
    .eq('status', 'available') // Rất quan trọng: Chỉ update khi status vẫn là available
    .select('*');

  if (updateItemError) throw updateItemError;

  // Nếu không update được dòng nào (do bị người khác mua trước) -> Thực hiện lại (retry)
  if (!updatedItem || updatedItem.length === 0) {
    return purchaseItem(tg_id, category_id); // Đệ quy thử lại sản phẩm khác
  }

  // 5. Trừ tiền user
  try {
    await updateUserBalance(tg_id, -price);
  } catch (balanceError) {
    // Hoàn tác trạng thái item nếu trừ tiền thất bại (an toàn giao dịch)
    await supabase
      .from('items')
      .update({
        status: 'available',
        buyer_id: null,
        sold_at: null
      })
      .eq('id', selectedItem.id);
    throw balanceError;
  }

  // 6. Ghi nhận đơn hàng vào bảng orders
  const { error: orderError } = await supabase
    .from('orders')
    .insert({
      tg_id,
      category_id,
      item_id: selectedItem.id,
      price
    });

  if (orderError) {
    console.error('Lỗi khi ghi nhận orders (đã trừ tiền và bán sản phẩm):', orderError);
    // Vẫn trả về thông tin tài khoản cho user vì tiền đã trừ và tài khoản đã được cấp
  }

  return {
    itemContent: selectedItem.content,
    categoryName: category.name,
    price: price
  };
}

/**
 * Mua dịch vụ book lịch (trừ tiền, ghi nhận đơn — không cần kho hàng)
 */
async function purchaseBooking(tg_id, category_id) {
  const user = await getUser(tg_id);
  if (!user) throw new Error('Không tìm thấy người dùng trên hệ thống.');

  const category = await getCategory(category_id);
  if (!category) throw new Error('Dịch vụ không tồn tại.');

  const price = Number(category.price);
  if (Number(user.balance) < price) {
    throw new Error('Số dư tài khoản không đủ để thực hiện giao dịch này.');
  }

  await updateUserBalance(tg_id, -price);

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      tg_id,
      category_id,
      item_id: null,
      price,
    })
    .select('*')
    .single();

  if (orderError) {
    await updateUserBalance(tg_id, price);
    throw orderError;
  }

  return {
    orderId: order.id,
    categoryName: category.name,
    price,
  };
}

/**
 * Cập nhật thông tin book lịch vào đơn hàng
 */
async function updateBookingInfo(orderId, tg_id, bookingInfo) {
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('tg_id', tg_id)
    .single();

  if (fetchError || !order) throw new Error('Không tìm thấy đơn book lịch.');

  const { data: item, error: itemError } = await supabase
    .from('items')
    .insert({
      category_id: order.category_id,
      content: bookingInfo,
      status: 'sold',
      buyer_id: tg_id,
      sold_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (itemError) throw itemError;

  const { error: updateError } = await supabase
    .from('orders')
    .update({ item_id: item.id })
    .eq('id', orderId);

  if (updateError) throw updateError;

  return item;
}

/**
 * Lấy danh sách đơn book lịch (admin)
 */
async function getBookingOrders(limit = 20) {
  const bookingCategory = await getCategoryByName('Book Lịch Hà Nội');
  if (!bookingCategory) return [];

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      tg_id,
      price,
      created_at,
      items ( content )
    `)
    .eq('category_id', bookingCategory.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

/**
 * Lấy lịch sử mua tài khoản của người dùng
 */
async function getPurchaseHistory(tg_id) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      price,
      created_at,
      categories ( name ),
      items ( content )
    `)
    .eq('tg_id', tg_id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Lấy lịch sử nạp tiền của người dùng
 */
async function getDepositHistory(tg_id) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('tg_id', tg_id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Thêm danh mục mới (Admin)
 */
async function adminCreateCategory(name, description, price) {
  const { data, error } = await supabase
    .from('categories')
    .insert({ name, description, price: Number(price) })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Cập nhật danh mục (Admin / Seed)
 */
async function adminUpdateCategory(id, updates) {
  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Xóa danh mục (Admin)
 */
async function adminDeleteCategory(id) {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
}

/**
 * Thêm tài khoản hàng loạt (Admin)
 */
async function adminAddItems(category_id, contents) {
  const itemsToInsert = contents.map(content => ({
    category_id,
    content: content.trim(),
    status: 'available'
  }));

  const { data, error } = await supabase
    .from('items')
    .insert(itemsToInsert)
    .select('*');

  if (error) throw error;
  return data;
}

/**
 * Lấy thống kê hệ thống (Admin)
 */
async function adminGetStats() {
  const { count: usersCount, error: err1 } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });

  const { data: salesData, error: err2 } = await supabase
    .from('orders')
    .select('price');

  const { count: itemsCount, error: err3 } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'available');

  if (err1 || err2 || err3) throw (err1 || err2 || err3);

  const totalRevenue = salesData.reduce((sum, item) => sum + Number(item.price), 0);

  return {
    totalUsers: usersCount || 0,
    totalSales: salesData.length || 0,
    totalRevenue,
    stockCount: itemsCount || 0
  };
}

/**
 * Lấy chi tiết kho của từng danh mục bao gồm số lượng sẵn có và số lượng đã bán
 */
async function adminGetCategoriesStock() {
  const { data: categories, error } = await supabase
    .from('categories')
    .select('id, name, price')
    .order('name', { ascending: true });

  if (error) throw error;

  const stockDetails = [];
  for (const cat of categories) {
    const { count: available, error: err1 } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', cat.id)
      .eq('status', 'available');

    const { count: sold, error: err2 } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', cat.id)
      .eq('status', 'sold');

    if (err1 || err2) throw (err1 || err2);

    stockDetails.push({
      id: cat.id,
      name: cat.name,
      price: cat.price,
      available: available || 0,
      sold: sold || 0
    });
  }
  return stockDetails;
}

module.exports = {
  getOrCreateUser,
  getUser,
  updateUserBalance,
  getCategories,
  getCategory,
  getCategoryByName,
  getAvailableItemsCount,
  createTransaction,
  getTransaction,
  updateTransactionStatus,
  purchaseItem,
  purchaseBooking,
  updateBookingInfo,
  getBookingOrders,
  getPurchaseHistory,
  getDepositHistory,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
  adminAddItems,
  adminGetStats,
  adminGetCategoriesStock
};
