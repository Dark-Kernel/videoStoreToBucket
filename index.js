const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const PORT = process.env.PORT || "8080";
const endpoint = process.env.R2_ENDPOINT
const region = process.env.R2_REGION
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const bucketName = process.env.R2_BUCKET

const upload = multer({ dest: '/tmp' });

const app = express();

const s3 = new S3Client({
	region: `${region}`,
	endpoint: `${endpoint}`,
	credentials: {
		accessKeyId: `${accessKeyId}`,
		secretAccessKey: `${secretAccessKey}`,
	}
});

app.post('/upload', upload.single('video'), async (req, res) => {
	if (!req.file) return res.status(400).send('No file uploaded');
	if (req.file.size > 30 * 1024 * 1024) {
		fs.unlinkSync(req.file.path);
		return res.status(400).send('File too large (limit: 30MB)');
	}

	const inputPath = req.file.path;
	const outputPath = path.join('/tmp', `${Date.now()}_compressed.mp4`);

	const cmd = `ffmpeg -i "${inputPath}" -vcodec libx264 -crf 23 -preset fast "${outputPath}" -y`;

	exec(cmd, async (err) => {
		fs.unlinkSync(inputPath);
        console.log(err)
		if (err) return res.status(500).send('Compression failed');

		const fileStream = fs.createReadStream(outputPath);
		const r2Key = `videos/compressed/${Date.now()}_${req.file.originalname}`;

		await s3.send(new PutObjectCommand({
			Bucket: `${bucketName}`,
			Key: r2Key,
			Body: fileStream,
			ContentType: 'video/mp4'
		}));

		fs.unlinkSync(outputPath);
        res.setHeader('Access-Control-Allow-Origin', '*');
		res.json({ message: 'Uploaded and compressed', key: r2Key });
	});
});

// app.get('/video/*', async (req, res) => {
app.get(/^\/video\/(.*)$/, async (req, res) => {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const key = req.params[0];

  try {
    const data = await s3.send(new GetObjectCommand({
      Bucket: `${bucketName}`,
      Key: key,
    }));

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'video/mp4');
    data.Body.pipe(res);
  } catch (e) {
    res.status(404).send('Not found');
  }
});


app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`)
});

