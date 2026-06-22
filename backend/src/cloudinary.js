const { v2: cloudinary } = require('cloudinary');
const config = require('./config');

const isConfigured = Boolean(
  config.cloudinary.cloudName &&
  config.cloudinary.apiKey &&
  config.cloudinary.apiSecret
);

if (isConfigured) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true
  });
}

function uploadBuffer(buffer, options = {}) {
  if (!isConfigured) {
    throw new Error('Cloudinary не настроен. Заполните CLOUDINARY_* в переменных окружения');
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: config.cloudinary.folder,
        resource_type: 'image',
        transformation: [
          { width: 1600, height: 1600, crop: 'limit' },
          { quality: 'auto:good', fetch_format: 'auto' }
        ],
        ...options
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

async function destroyImage(publicId) {
  if (!isConfigured || !publicId) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}

module.exports = { uploadBuffer, destroyImage, isConfigured };
