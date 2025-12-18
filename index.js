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
        //res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Origin', 'https://scrollconnect.com, https://www.scrollconnect.com, http://localhost:3000');
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

    //res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Origin', 'https://scrollconnect.com, https://www.scrollconnect.com, http://localhost:3000');

    res.setHeader('Content-Type', 'video/mp4');
    data.Body.pipe(res);
  } catch (e) {
    res.status(404).send('Not found');
  }
});


app.post('/upload-doc', upload.single('file'), async (req, res) => {
	if (!req.file || !req.body.file_name) return res.status(400).send('No file uploaded');
	if (req.file.size > 10 * 1024 * 1024) {
		fs.unlinkSync(req.file.path);
		return res.status(400).send('File too large (limit: 10MB)');
	}

	const fileStream = fs.createReadStream(req.file.path);
	// const r2Key = `documents/${Date.now()}_${req.file.originalname}`;
	const r2Key = `documents/${req.body.file_name}`;

	try {
		await s3.send(new PutObjectCommand({
			Bucket: `${bucketName}`,
			Key: r2Key,
			Body: fileStream,
			ContentType: req.file.mimetype,
		}));
		fs.unlinkSync(req.file.path);
		//res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Origin', 'https://scrollconnect.com, https://www.scrollconnect.com, http://localhost:3000');

		res.json({ success: true, message: 'Uploaded document', key: r2Key });
	} catch (err) {
		fs.unlinkSync(req.file.path);
        console.error(err);
		res.status(500).json({ success: false, message: 'Upload failed' });
	}
});

app.get(/^\/document\/(.*)$/, async (req, res) => {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const key = req.params[0];

  try {
    const data = await s3.send(new GetObjectCommand({
      Bucket: `${bucketName}`,
      Key: `documents/${key}`,
    }));

    //res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Origin', 'https://scrollconnect.com, https://www.scrollconnect.com, http://localhost:3000');

    res.setHeader('Content-Type', data.ContentType || 'application/octet-stream');
    data.Body.pipe(res);
  } catch (e) {
    res.status(404).send('Not found');
  }
});



app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`)
});

