const PRODUCTS = {
  album_photos: {
    slug: 'album_photos',
    name: '📸 Album Ảnh',
    dbName: 'Album Ảnh',
    price: 50000,
    description: 'Bộ album ảnh độc quyền — thanh toán xong nhận link ngay.',
    type: 'digital',
  },
  album_video: {
    slug: 'album_video',
    name: '📸🎬 Album Ảnh + Video',
    dbName: 'Album Ảnh + Video',
    price: 60000,
    description: 'Album ảnh kèm video — thanh toán xong nhận link ngay.',
    type: 'digital',
  },
  book_hanoi: {
    slug: 'book_hanoi',
    name: '💬 Book Lịch Trò Chuyện (Hà Nội)',
    dbName: 'Book Lịch Hà Nội',
    price: 20000,
    description: 'Đặt lịch trò chuyện trực tiếp tại Hà Nội — phí book lịch.',
    type: 'booking',
  },
};

const PRODUCT_LIST = Object.values(PRODUCTS);

function getProductBySlug(slug) {
  return PRODUCTS[slug] || null;
}

function formatPrice(price) {
  return Number(price).toLocaleString('vi-VN');
}

module.exports = {
  PRODUCTS,
  PRODUCT_LIST,
  getProductBySlug,
  formatPrice,
};