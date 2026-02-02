const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const tf = require('@tensorflow/tfjs');
const Article = require('./models/Article');
const User = require('./models/User');
const url = require('url');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

const cleanText = (text) => {
  const patternsToRemove = [
    /Subscribe for full access to The Hollywood Reporter/gi,
    /This story was originally published on March 22 at 9:25 a\.m\./gi,
    /Sign up for THR news straight to your inbox every day/gi,
    /Send us a tip using our anonymous form\./gi,
    /Premium subscribers now\./gi,
    /Skip to main content/gi,
    /For more on The White Lotus, sign up for The White Lotus Club, our subscriber-exclusive newsletter/gi,
    /Get poll alerts and updates on the AP Top 25 throughout the season\. Sign up here\. By JIM FULLER Associated Press/gi,
    /Be the first to know and subscribe for real-time news email updates on these topic/gi,
    /See More SHARE THIS ARTICLE ON/gi,
    /Share this article on/gi,
    /See more.*?/gi,
    /Subscribe for full access.*?/gi,
    /This story was originally published.*?(\d{1,2}:\d{2}\s*[ap]\.m\.)?/gi,
    /Sign up for .*?(news|inbox|every day|Club|here)?/gi,
    /Send us a tip.*?/gi,
    /Premium subscribers.*?/gi,
    /Skip to.*?content/gi,
    /For more on .*?, sign up for.*?newsletter/gi,
    /By [A-Z][A-Za-z\s]+ Associated Press/gi,
    /Get .*? alerts and updates.*?Sign up here\./gi,
    /Be the first to know and subscribe for.*?updates.*?/gi,
  ];

  let cleaned = text;
  patternsToRemove.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, '');
  });

  return cleaned.replace(/\s+/g, ' ').trim();
};

const scrapeFullText = async (url) => {
  try {
    const { data } = await axios.get(url);
    const dom = new JSDOM(data, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.textContent) {
      console.error(`No content scraped from ${url}`);
      return 'Unable to scrape full text';
    }

    return cleanText(article.textContent);
  } catch (error) {
    console.error(`Error scraping ${url}:`, error.message);
    return 'Unable to scrape full text';
  }
};

const assignCategory = async (title) => {
  try {
    const response = await axios.post('http://localhost:5001/categorize', { title }, { timeout: 10000 });
    console.log(`API returned "${response.data.category}" for "${title}"`);
    return response.data.category || 'General';
  } catch (error) {
    console.error(`Error categorizing "${title}":`, error.message);
    return 'General';
  }
};

const cleanUpMongoDB = async () => {
  try {
    console.log('Starting MongoDB duplicate cleanup...');
    const unscrapableCount = await Article.deleteMany({ fullText: 'Unable to scrape full text' });
    console.log(`Removed ${unscrapableCount.deletedCount} unscrapable articles`);

    const duplicates = await Article.aggregate([
      {
        $group: {
          _id: { url: { $toLower: "$url" }, title: { $toLower: "$title" } },
          ids: { $push: "$_id" },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]);

    let duplicateIds = [];
    duplicates.forEach((doc) => {
      doc.ids.shift();
      duplicateIds.push(...doc.ids);
    });

    if (duplicateIds.length > 0) {
      const result = await Article.deleteMany({ _id: { $in: duplicateIds } });
      console.log(`Deleted ${result.deletedCount} duplicate articles`);
    } else {
      console.log('No duplicates found in MongoDB');
    }
  } catch (error) {
    console.error('Error during MongoDB cleanup:', error);
  }
};

const fetchAndStoreNews = async () => {
  if (process.env.FETCH_NEWS === 'false') {
    console.log('News fetching is disabled via FETCH_NEWS=false');
    return;
  }

  try {
    const fetchWithTimeout = async (url, options = {}) => {
      return axios.get(url, { ...options, timeout: 10000 });
    };

    // Fetch Indian news
    let indiaNewsApiArticles = [];
    try {
      const newsApiResponse = await fetchWithTimeout(
        `https://newsapi.org/v2/top-headlines?country=in&apiKey=${process.env.NEWS_API_KEY}`
      );
      indiaNewsApiArticles = newsApiResponse.data.articles || [];
      console.log(`Fetched ${indiaNewsApiArticles.length} Indian news articles from NewsAPI`);
    } catch (error) {
      console.error('Error fetching Indian news from NewsAPI:', error.message);
    }

    let indiaGnewsArticles = [];
    try {
      const gnewsResponse = await fetchWithTimeout(
        `https://gnews.io/api/v4/top-headlines?lang=en&country=in&max=20&apikey=${process.env.GNEWS_API_KEY}`
      );
      indiaGnewsArticles = gnewsResponse.data.articles || [];
      console.log(`Fetched ${indiaGnewsArticles.length} Indian news articles from GNews`);
    } catch (error) {
      console.error('Error fetching Indian news from GNews:', error.message);
    }

    // Fetch US news
    let usNewsApiArticles = [];
    try {
      const newsApiResponse = await fetchWithTimeout(
        `https://newsapi.org/v2/top-headlines?country=us&apiKey=${process.env.NEWS_API_KEY}`
      );
      usNewsApiArticles = newsApiResponse.data.articles || [];
      console.log(`Fetched ${usNewsApiArticles.length} US news articles from NewsAPI`);
    } catch (error) {
      console.error('Error fetching US news from NewsAPI:', error.message);
    }

    let usGnewsArticles = [];
    try {
      const gnewsResponse = await fetchWithTimeout(
        `https://gnews.io/api/v4/top-headlines?lang=en&country=us&max=20&apikey=${process.env.GNEWS_API_KEY}`
      );
      usGnewsArticles = gnewsResponse.data.articles || [];
      console.log(`Fetched ${usGnewsArticles.length} US news articles from GNews`);
    } catch (error) {
      console.error('Error fetching US news from GNews:', error.message);
    }

    const allArticles = [
      ...indiaNewsApiArticles.map((article) => ({
        title: article.title,
        url: article.url,
        image: article.urlToImage || 'https://plus.unsplash.com/premium_photo-1707080369554-359143c6aa0b?q=80&w=1932&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
        country: 'in',
      })),
      ...indiaGnewsArticles.map((article) => ({
        title: article.title,
        url: article.url,
        image: article.image || 'https://plus.unsplash.com/premium_photo-1707080369554-359143c6aa0b?q=80&w=1932&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
        country: 'in',
      })),
      ...usNewsApiArticles.map((article) => ({
        title: article.title,
        url: article.url,
        image: article.urlToImage || 'https://plus.unsplash.com/premium_photo-1707080369554-359143c6aa0b?q=80&w=1932&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
        country: 'us',
      })),
      ...usGnewsArticles.map((article) => ({
        title: article.title,
        url: article.url,
        image: article.image || 'https://plus.unsplash.com/premium_photo-1707080369554-359143c6aa0b?q=80&w=1932&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
        country: 'us',
      })),
    ];

    console.log('Total articles before deduplication:', allArticles.length);

    const seenIdentifiers = new Set();
    const normalizeTitle = (title) => title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim();
    const normalizeUrl = (inputUrl) => {
      try {
        const parsedUrl = new URL(inputUrl);
        return `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`.toLowerCase().replace(/\/$/, '');
      } catch (e) {
        console.error(`Invalid URL: ${inputUrl}`);
        return inputUrl.toLowerCase().replace(/\/$/, '');
      }
    };

    const existingArticles = await Article.find({}, 'url title');
    console.log(`Found ${existingArticles.length} existing articles in MongoDB`);

    existingArticles.forEach((article) => {
      const urlNormalized = normalizeUrl(article.url);
      const titleNormalized = normalizeTitle(article.title);
      seenIdentifiers.add(`url:${urlNormalized}`);
      seenIdentifiers.add(`title:${titleNormalized}`);
    });

    const uniqueArticles = [];
    let skippedCount = 0;
    for (const article of allArticles) {
      const urlNormalized = normalizeUrl(article.url);
      const titleNormalized = normalizeTitle(article.title);
      if (!seenIdentifiers.has(`url:${urlNormalized}`) && !seenIdentifiers.has(`title:${titleNormalized}`)) {
        seenIdentifiers.add(`url:${urlNormalized}`);
        seenIdentifiers.add(`title:${titleNormalized}`);
        const category = await assignCategory(article.title);
        console.log(`Assigned "${category}" to "${article.title}"`);
        uniqueArticles.push({ ...article, category, fetchedAt: new Date() });
      } else {
        skippedCount++;
        console.log(`Skipped duplicate: "${article.title}" (${article.url})`);
      }
    }
    console.log(`Skipped ${skippedCount} articles as duplicates`);
    console.log(`Total new unique articles: ${uniqueArticles.length}`);

    if (uniqueArticles.length === 0) {
      console.log('No unique articles to process further');
      return;
    }

    const articlesWithFullText = await Promise.all(
      uniqueArticles.map(async (article) => {
        const fullText = await scrapeFullText(article.url);
        if (fullText === 'Unable to scrape full text') {
          console.log(`Excluding "${article.title}" due to unscrapable content`);
          return null;
        }
        console.log(`Scraped text for "${article.title}": ${fullText.slice(0, 50)}...`);
        return { ...article, fullText, likes: 0 };
      })
    );

    const validArticles = articlesWithFullText.filter(article => article !== null);
    console.log(`Valid articles after scraping: ${validArticles.length}`);

    if (validArticles.length > 0) {
      try {
        if (mongoose.connection.readyState !== 1) {
          throw new Error('MongoDB connection is not active');
        }
        await Promise.all(
          validArticles.map(async (article) => {
            const urlNormalized = normalizeUrl(article.url);
            const titleNormalized = normalizeTitle(article.title);
            await Article.updateOne(
              {
                $or: [
                  { url: article.url },
                  { title: article.title }
                ]
              },
              { $setOnInsert: article },
              { upsert: true }
            );
            console.log(`Processed article: "${article.title}" (Country: ${article.country})`);
          })
        );
        console.log(`Processed ${validArticles.length} new news articles`);
      } catch (error) {
        console.error('Error storing articles in MongoDB:', error);
      }
    } else {
      console.log('No valid articles to store after scraping');
    }

    await cleanUpMongoDB();

    const uncategorized = await Article.find({ category: { $exists: false } });
    if (uncategorized.length > 0) {
      console.log(`Found ${uncategorized.length} uncategorized articles, updating...`);
      await Promise.all(
        uncategorized.map(async (article) => {
          const category = await assignCategory(article.title);
          article.category = category;
          await article.save();
          console.log(`Updated "${article.title}" with category "${category}"`);
        })
      );
    }
  } catch (error) {
    console.error('Error in fetchAndStoreNews:', error);
  }
};

const getFeatureVector = async (userId, article) => {
  const categories = ['Sports', 'Tech', 'General', 'Politics', 'Entertainment'];
  const categoryIndex = categories.indexOf(article.category || 'General');
  const categoryOneHot = categories.map((_, i) => (i === categoryIndex ? 1 : 0));

  const timeSpent = article.timeSpent?.find(ts => ts.user.toString() === userId)?.seconds || 0;
  const likedBy = article.likedBy?.includes(userId) ? 1 : 0;
  const sharedBy = article.sharedBy?.includes(userId) ? 1 : 0;
  const commentCount = article.comments.filter(c => c.user.toString() === userId).length;

  const userInteractedCategories = await Article.distinct('category', { likedBy: userId });
  const categoryBoost = userInteractedCategories.includes(article.category) ? 2 : 1;
  const boostedCategory = categoryOneHot.map(val => val * categoryBoost);

  const hoursSinceFetched = (Date.now() - new Date(article.fetchedAt).getTime()) / (1000 * 60 * 60);
  const recencyScore = Math.max(0, 1 - hoursSinceFetched / 24);

  const timeSpentWeighted = (timeSpent / 60) * 5;

  return [
    likedBy,
    sharedBy,
    commentCount,
    timeSpentWeighted,
    ...boostedCategory,
    recencyScore,
  ];
};

const prepareTrainingData = async (userId) => {
  const articles = await Article.find();
  const interactedArticles = await Article.find({
    $or: [
      { 'likedBy': userId },
      { 'sharedBy': userId },
      { 'comments.user': userId },
      { 'timeSpent.user': userId },
    ],
  });
  console.log(`Interacted articles: ${interactedArticles.length}, Titles: ${interactedArticles.map(a => a.title).join(', ')}`);

  const positiveData = await Promise.all(
    interactedArticles.map(async (article) => ({
      features: await getFeatureVector(userId, article),
      label: 1,
    }))
  );

  const nonInteracted = articles.filter(a => !interactedArticles.some(ia => ia._id.equals(a._id)));
  const negativeSample = nonInteracted.slice(0, positiveData.length);
  const negativeData = await Promise.all(
    negativeSample.map(async (article) => ({
      features: await getFeatureVector(userId, article),
      label: 0,
    }))
  );

  const allData = [...positiveData, ...negativeData];
  if (allData.length === 0) {
    console.log('No training data available for user', userId);
    return { X: null, y: null, featureLength: 0 };
  }
  const X = tf.tensor2d(allData.map(d => d.features));
  const y = tf.tensor1d(allData.map(d => d.label), 'float32');

  console.log(`Prepared ${allData.length} training examples for user ${userId}`);
  return { X, y, featureLength: allData[0].features.length };
};

const trainModel = async (userId) => {
  const { X, y, featureLength } = await prepareTrainingData(userId);

  if (!X || !y) {
    console.log('No model trained due to insufficient data');
    return null;
  }

  const model = tf.sequential();
  model.add(tf.layers.dense({
    units: 16,
    activation: 'relu',
    inputShape: [featureLength],
  }));
  model.add(tf.layers.dense({
    units: 8,
    activation: 'relu',
  }));
  model.add(tf.layers.dense({
    units: 1,
    activation: 'sigmoid',
  }));

  model.compile({
    optimizer: 'adam',
    loss: 'binaryCrossentropy',
    metrics: ['accuracy'],
  });

  await model.fit(X, y, {
    epochs: 20,
    batchSize: 32,
    validationSplit: 0.2,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        console.log(`Epoch ${epoch}: loss = ${logs.loss}, accuracy = ${logs.acc}`);
      },
    },
  });

  X.dispose();
  y.dispose();

  model.lastTrainingTime = new Date();
  console.log('Model training completed');
  return model;
};

let trainedModel = null;
let lastTrainedUser = null;
let cachedScores = {};

cleanUpMongoDB().then(() => fetchAndStoreNews());

const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: 'User already exists' });

    user = new User({ name, email, password });
    user.password = await bcrypt.hash(password, 10);
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { id: user._id, name, email } });
  } catch (error) {
    res.status(500).json({ message: 'Error registering user', error });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { id: user._id, name: user.name, email } });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error });
  }
});

app.put('/api/profile', authMiddleware, async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (email) {
      const emailExists = await User.findOne({ email, _id: { $ne: user._id } });
      if (emailExists) return res.status(400).json({ message: 'Email already in use' });
      user.email = email;
    }
    if (password) user.password = await bcrypt.hash(password, 10);

    await user.save();
    res.json({ user: { id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Error updating profile', error });
  }
});

let lastArticleCount = null;

app.get('/api/articles', async (req, res) => {
  try {
    const articles = await Article.find().sort({ fetchedAt: -1 });
    if (lastArticleCount !== articles.length) {
      console.log(`Returning ${articles.length} articles from /api/articles`);
      lastArticleCount = articles.length;
    }
    res.json(articles);
  } catch (error) {
    console.error('Error fetching articles:', error);
    res.status(500).json({ message: 'Error fetching articles', error });
  }
});

app.post('/api/articles/:id/like', authMiddleware, async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Article not found' });

    const userId = req.user.id;
    console.log(`Liking article ${req.params.id} for user ${userId}`);

    const hasLiked = article.likedBy.includes(userId);

    if (hasLiked) {
      article.likes -= 1;
      article.likedBy = article.likedBy.filter((id) => id.toString() !== userId);
      console.log(`Unliked: ${article.title}, likedBy: ${article.likedBy}, user: ${userId}`);
    } else {
      article.likes += 1;
      article.likedBy.push(userId);
      console.log(`Liked: ${article.title}, likedBy: ${article.likedBy}, user: ${userId}, updatedAt: ${article.updatedAt}`);
    }

    await article.save();
    res.json(article);
  } catch (error) {
    console.error(`Error toggling like for user ${req.user?.id || 'unknown'}:`, error);
    res.status(500).json({ message: 'Error toggling like', error });
  }
});

app.get('/api/articles/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ message: 'Search term is required' });

    // Escape special regex characters in the query
    const escapedQuery = q.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'i');

    // Use aggregation to prioritize title matches, then fullText matches
    const articles = await Article.aggregate([
      {
        $match: {
          $or: [
            { title: { $regex: regex } },
            { fullText: { $regex: regex } },
          ],
        },
      },
      {
        $addFields: {
          titleMatch: { $regexMatch: { input: '$title', regex: regex } },
        },
      },
      {
        $sort: {
          titleMatch: -1, // True (1) first, False (0) second
          fetchedAt: -1, // Secondary sort by recency
        },
      },
      {
        $project: {
          titleMatch: 0, // Remove temporary field
        },
      },
    ]);

    console.log(`Found ${articles.length} articles for query "${q}"`);
    res.json(articles);
  } catch (error) {
    console.error('Error searching articles:', error);
    res.status(500).json({ message: 'Error searching articles', error });
  }
});

app.get('/api/articles/top', async (req, res) => {
  try {
    const topArticles = await Article.find({})
      .sort({ likes: -1 })
      .limit(5);
    console.log(`Returning ${topArticles.length} top articles`);
    res.json(topArticles);
  } catch (error) {
    console.error('Error fetching top articles:', error);
    res.status(500).json({ message: 'Error fetching top articles', error });
  }
});

app.get('/api/articles/:id/comments', async (req, res) => {
  try {
    const article = await Article.findById(req.params.id).populate('comments.user', 'name');
    if (!article) return res.status(404).json({ message: 'Article not found' });
    res.json(article.comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ message: 'Error fetching comments', error });
  }
});

app.post('/api/articles/:id/comments', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'Comment text is required' });

    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Article not found' });

    const comment = {
      user: req.user.id,
      text,
      createdAt: new Date(),
    };
    article.comments.push(comment);
    await article.save();

    const updatedArticle = await Article.findById(req.params.id).populate('comments.user', 'name');
    res.json(updatedArticle.comments);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: 'Error adding comment', error });
  }
});

app.get('/api/articles/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const articles = await Article.find({ category: { $regex: new RegExp(category, 'i') } })
      .sort({ fetchedAt: -1 });
    console.log(`Found ${articles.length} articles in category "${category}"`);
    res.json(articles);
  } catch (error) {
    console.error('Error fetching category articles:', error);
    res.status(500).json({ message: 'Error fetching category articles', error });
  }
});

app.get('/api/articles/country/:countryCode/category/:category', async (req, res) => {
  try {
    const { countryCode, category } = req.params;
    if (!['in', 'us'].includes(countryCode)) {
      return res.status(400).json({ message: 'Invalid country code. Use "in" or "us".' });
    }
    const articles = await Article.find({
      country: countryCode,
      category: { $regex: new RegExp(category, 'i') },
    }).sort({ fetchedAt: -1 });
    console.log(`Found ${articles.length} articles in category "${category}" for country "${countryCode}"`);
    res.json(articles);
  } catch (error) {
    console.error('Error fetching country/category articles:', error);
    res.status(500).json({ message: 'Error fetching country/category articles', error });
  }
});

app.get('/api/MyNews', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`Starting MyNews request for user ${userId}`);

    const objectIdUser = new mongoose.Types.ObjectId(userId);

    const hasInteractions = await Article.findOne({
      $or: [
        { likedBy: objectIdUser },
        { sharedBy: objectIdUser },
        { 'comments.user': objectIdUser },
        { 'timeSpent.user': objectIdUser },
      ],
    });

    if (!hasInteractions) {
      console.log(`No interactions for user ${userId}, returning 18 random articles`);
      const randomArticles = await Article.aggregate([{ $sample: { size: 18 } }]);
      return res.json(randomArticles);
    }

    // Fetch all articles
    const articles = await Article.find();
    console.log(`Fetched ${articles.length} articles`);

    if (articles.length === 0) {
      console.log('No articles available, returning empty response');
      return res.json([]);
    }

    const lastInteraction = await Article.findOne({
      $or: [
        { likedBy: objectIdUser },
        { sharedBy: objectIdUser },
        { 'comments.user': objectIdUser },
        { 'timeSpent.user': objectIdUser },
      ],
    }).sort({ updatedAt: -1 });
    console.log(`Last interaction: ${lastInteraction ? lastInteraction.title + ' at ' + lastInteraction.updatedAt : 'none'}`);

    const lastTrainingTime = lastTrainedUser === userId && trainedModel ? trainedModel.lastTrainingTime : null;
    const hasNewInteractions = lastInteraction && (!lastTrainingTime || lastInteraction.updatedAt > lastTrainingTime);
    console.log(`Last training: ${lastTrainingTime || 'never'}, Has new interactions: ${hasNewInteractions}`);

    if (!trainedModel || lastTrainedUser !== userId || hasNewInteractions) {
      console.log(`Training model for user ${userId} due to ${hasNewInteractions ? 'new interactions' : 'user change or no model'}`);
      trainedModel = await trainModel(userId);
      lastTrainedUser = userId;
      if (trainedModel) {
        trainedModel.lastTrainingTime = new Date();
        console.log('Model trained successfully');
      } else {
        console.log('Model training failed or no data');
      }
    } else {
      console.log('Using existing model');
    }

    let scoredArticles;
    if (!trainedModel) {
      console.log('No trained model available, using fallback');
      scoredArticles = articles.map(article => ({ ...article.toObject(), score: 0 }));
    } else {
      console.log('Generating feature vectors');
      const features = await Promise.all(articles.map(a => getFeatureVector(userId, a)));
      const X = tf.tensor2d(features);
      console.log('Predicting with model');
      const predictions = trainedModel.predict(X);
      const scores = await predictions.data();
      scoredArticles = articles.map((article, i) => ({
        ...article.toObject(),
        score: scores[i],
      }));
      console.log(`Top 5 scored articles: ${JSON.stringify(scoredArticles.slice(0, 5).map(a => ({ title: a.title, score: a.score })))}`);
      X.dispose();
      predictions.dispose();
    }

    // Calculate interaction points by category and country
    const interactions = await Article.aggregate([
      {
        $match: {
          $or: [
            { likedBy: objectIdUser },
            { sharedBy: objectIdUser },
            { 'comments.user': objectIdUser },
            { 'timeSpent.user': objectIdUser },
          ],
        },
      },
      {
        $project: {
          category: 1,
          country: 1,
          likeCount: {
            $cond: [{ $in: [objectIdUser, '$likedBy'] }, 1, 0],
          },
          shareCount: {
            $cond: [{ $in: [objectIdUser, '$sharedBy'] }, 1, 0],
          },
          commentCount: {
            $size: {
              $filter: {
                input: '$comments',
                as: 'comment',
                cond: { $eq: ['$$comment.user', objectIdUser] },
              },
            },
          },
          timeSpentCount: {
            $cond: [
              {
                $gt: [
                  {
                    $ifNull: [
                      {
                        $arrayElemAt: [
                          '$timeSpent.seconds',
                          { $indexOfArray: ['$timeSpent.user', objectIdUser] },
                        ],
                      },
                      0,
                    ],
                  },
                  30,
                ],
              },
              1,
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: { category: '$category', country: '$country' },
          totalPoints: {
            $sum: {
              $add: ['$likeCount', '$shareCount', '$commentCount', '$timeSpentCount'],
            },
          },
        },
      },
    ]);

    // Organize interactions by category and compute Indian proportion
    const categoryInteractions = interactions.reduce((acc, { _id, totalPoints }) => {
      const { category, country } = _id;
      if (!acc[category]) acc[category] = { total: 0, indian: 0 };
      acc[category].total += totalPoints;
      if (country === 'in') acc[category].indian += totalPoints;
      return acc;
    }, {});
    const preferredCategories = Object.keys(categoryInteractions)
      .map(category => ({
        category,
        count: categoryInteractions[category].total,
        indianProportion: categoryInteractions[category].indian / categoryInteractions[category].total || 0.5, // Default 50% if no Indian interactions
      }))
      .sort((a, b) => b.count - a.count);
    console.log(`Preferred categories with Indian proportions: ${JSON.stringify(preferredCategories)}`);

    const slotAllocation = [6, 4, 3, 2, 1];
    const totalSlots = 18;
    const reservedForANN = 2;
    const categorySlotsTotal = totalSlots - reservedForANN;
    let MyNews = [];
    const usedCategories = new Set();

    // Allocate slots with Indian/US split
    for (let i = 0; i < Math.min(preferredCategories.length, slotAllocation.length); i++) {
      const { category, indianProportion } = preferredCategories[i];
      if (usedCategories.has(category)) continue;
      usedCategories.add(category);

      const slots = slotAllocation[i];
      const indianSlots = Math.round(slots * indianProportion); // E.g., 75% of 6 = 4-5
      const usSlots = slots - indianSlots;

      // Indian articles
      const indianArticles = scoredArticles
        .filter(a => a.category === category && a.country === 'in' && !MyNews.some(ma => ma._id.toString() === a._id.toString()))
        .sort((a, b) => b.score - a.score) // Sort by ANN score
        .slice(0, indianSlots);
      MyNews = MyNews.concat(indianArticles);
      console.log(`Allocated ${indianArticles.length} Indian ${category} slots (rank ${i + 1}, ${indianSlots} requested)`);

      // US articles
      const usArticles = scoredArticles
        .filter(a => a.category === category && a.country === 'us' && !MyNews.some(ma => ma._id.toString() === a._id.toString()))
        .sort((a, b) => b.score - a.score) // Sort by ANN score
        .slice(0, usSlots);
      MyNews = MyNews.concat(usArticles);
      console.log(`Allocated ${usArticles.length} US ${category} slots (rank ${i + 1}, ${usSlots} requested)`);
    }

    // Fill remaining category slots
    const filledSlots = MyNews.length;
    if (filledSlots < categorySlotsTotal) {
      const remainingSlots = categorySlotsTotal - filledSlots;
      const remainingCategories = scoredArticles
        .map(a => a.category)
        .filter(cat => !usedCategories.has(cat))
        .filter((cat, idx, self) => self.indexOf(cat) === idx);

      let slotsLeft = remainingSlots;
      for (const category of remainingCategories) {
        if (slotsLeft <= 0) break;
        const availableSlots = Math.min(slotsLeft, slotAllocation[usedCategories.size] || 1);
        const indianProportion = categoryInteractions[category]?.indianProportion || 0.5; // Default 50%
        const indianSlots = Math.round(availableSlots * indianProportion);
        const usSlots = availableSlots - indianSlots;

        // Indian articles
        const indianArticles = scoredArticles
          .filter(a => a.category === category && a.country === 'in' && !MyNews.some(ma => ma._id.toString() === a._id.toString()))
          .sort((a, b) => b.score - a.score)
          .slice(0, indianSlots);
        MyNews = MyNews.concat(indianArticles);
        console.log(`Filled ${indianArticles.length} Indian ${category} slots (${indianSlots} requested)`);

        // US articles
        const usArticles = scoredArticles
          .filter(a => a.category === category && a.country === 'us' && !MyNews.some(ma => ma._id.toString() === a._id.toString()))
          .sort((a, b) => b.score - a.score)
          .slice(0, usSlots);
        MyNews = MyNews.concat(usArticles);
        console.log(`Filled ${usArticles.length} US ${category} slots (${usSlots} requested)`);

        usedCategories.add(category);
        slotsLeft -= (indianArticles.length + usArticles.length);
      }
    }

    // Fill remaining slots with ANN-selected diverse articles
    const remainingSlots = totalSlots - MyNews.length;
    if (remainingSlots > 0) {
      const diversityArticles = scoredArticles
        .filter(a => !MyNews.some(ma => ma._id.toString() === a._id.toString()))
        .sort((a, b) => b.score - a.score)
        .slice(0, remainingSlots);
      MyNews = MyNews.concat(diversityArticles);
      console.log(`Added ${diversityArticles.length} ANN-selected articles for diversity`);
    }

    console.log(`Returning ${MyNews.length} personalized articles`, MyNews.map(a => ({ title: a.title, category: a.category, country: a.country })));
    res.json(MyNews);
  } catch (error) {
    console.error(`Error in /api/MyNews for user ${req.user?.id || 'unknown'}:`, error.stack);
    res.status(500).json({ message: 'Error fetching MyNews', error: error.message });
  }
});

app.post('/api/mynews/reset', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`Resetting preferences for user ${userId}`);

    await Article.updateMany(
      { likedBy: userId },
      { $pull: { likedBy: userId }, $inc: { likes: -1 } }
    );
    await Article.updateMany(
      { sharedBy: userId },
      { $pull: { sharedBy: userId } }
    );
    await Article.updateMany(
      { 'comments.user': userId },
      { $pull: { comments: { user: userId } } }
    );
    await Article.updateMany(
      { 'timeSpent.user': userId },
      { $pull: { timeSpent: { user: userId } } }
    );

    if (lastTrainedUser === userId) {
      trainedModel = null;
      lastTrainedUser = null;
    }
    cachedScores[userId] = null;

    const randomArticles = await Article.aggregate([{ $sample: { size: 18 } }]);
    console.log(`Reset complete for user ${userId}, returning ${randomArticles.length} random articles`);
    res.json(randomArticles);
  } catch (error) {
    console.error('Error resetting preferences:', error);
    res.status(500).json([]);
  }
});

app.post('/api/articles/:id/share', authMiddleware, async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Article not found' });

    const userId = req.user.id;
    if (!article.sharedBy.includes(userId)) {
      article.sharedBy.push(userId);
      await article.save();
      console.log(`User ${userId} shared article ${req.params.id}`);
    }
    res.json(article);
  } catch (error) {
    console.error('Error recording share:', error);
    res.status(500).json({ message: 'Error recording share', error });
  }
});

app.post('/api/articles/:id/time-spent', authMiddleware, async (req, res) => {
  try {
    const { seconds } = req.body;
    console.log('Received time-spent request:', { articleId: req.params.id, seconds, userId: req.user.id });
    if (!seconds || typeof seconds !== 'number' || seconds < 0) {
      return res.status(400).json({ message: 'Seconds must be a non-negative number' });
    }

    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Article not found' });

    const userId = req.user.id;
    const timeEntry = article.timeSpent.find(ts => ts.user.toString() === userId);
    if (timeEntry) {
      timeEntry.seconds += seconds;
    } else {
      article.timeSpent.push({ user: userId, seconds });
    }
    await article.save();
    console.log(`User ${userId} spent ${seconds} seconds on article ${req.params.id}`);
    res.json(article);
  } catch (error) {
    console.error('Error recording time spent:', error.message);
    res.status(500).json({ message: 'Error recording time spent', error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  trainedModel = null;
  fetchAndStoreNews();
});