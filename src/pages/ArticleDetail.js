import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

function ArticleDetail() {
  const { id } = useParams();
  const [article, setArticle] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));
  const navigate = useNavigate();
  const startTimeRef = useRef(Date.now()); // Store start time
  const lastSentRef = useRef(Date.now()); // Track last sent time

  useEffect(() => {
    const fetchArticleAndComments = async () => {
      try {
        // Fetch article
        const articleResponse = await axios.get(`http://localhost:5000/api/articles`);
        const selectedArticle = articleResponse.data.find((a) => a._id === id);
        if (!selectedArticle) throw new Error('Article not found');

        // Fetch comments
        const commentsResponse = await axios.get(`http://localhost:5000/api/articles/${id}/comments`);
        
        setArticle({
          ...selectedArticle,
          id: selectedArticle._id,
          likes: selectedArticle.likes || 0,
          liked: user ? selectedArticle.likedBy.includes(user.id) : false,
        });
        setComments(commentsResponse.data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching article or comments:', error);
        setLoading(false);
      }
    };
    fetchArticleAndComments();

    // Track time spent periodically
    if (!token) {
      console.log('No token found, time tracking disabled');
      return;
    }

    const intervalId = setInterval(() => {
      const currentTime = Date.now();
      const secondsSinceLast = Math.floor((currentTime - lastSentRef.current) / 1000);
      if (secondsSinceLast >= 10) { // Send every 10 seconds
        const totalSeconds = Math.floor((currentTime - startTimeRef.current) / 1000);
        console.log(`Sending ${secondsSinceLast} seconds for article ${id}`);
        axios.post(`http://localhost:5000/api/articles/${id}/time-spent`, { seconds: secondsSinceLast }, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then(response => {
          console.log(`Successfully recorded ${secondsSinceLast} seconds for article ${id}`, response.data);
          lastSentRef.current = currentTime; // Update last sent time
        })
        .catch(error => {
          console.error('Error recording time spent:', error.response?.data || error.message);
        });
      }
    }, 10000); // Check every 10 seconds

    // Cleanup on unmount
    return () => {
      clearInterval(intervalId);
      const finalTime = Date.now();
      const finalSeconds = Math.floor((finalTime - lastSentRef.current) / 1000);
      if (finalSeconds > 0) {
        console.log(`Final cleanup: sending ${finalSeconds} seconds for article ${id}`);
        axios.post(`http://localhost:5000/api/articles/${id}/time-spent`, { seconds: finalSeconds }, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then(() => console.log(`Final ${finalSeconds} seconds recorded for article ${id}`))
        .catch(error => console.error('Final time recording error:', error.response?.data || error.message));
      }
    };
  }, [id, user, token]);

  const handleToggleTTS = () => {
    if (isPlaying) {
      window.speechSynthesis.cancel(); // Stop TTS
      setIsPlaying(false);
    } else if (article && article.fullText && article.fullText !== 'Unable to scrape full text') {
      const utterance = new SpeechSynthesisUtterance(article.fullText);
      utterance.onend = () => setIsPlaying(false); // Reset when finished
      utterance.onerror = (event) => {
        console.error('TTS error:', event);
        setIsPlaying(false);
      };
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
    }
  };

  const handleLike = async () => {
    if (!token) {
      alert('Please log in to like articles');
      return;
    }
    try {
      const response = await axios.post(
        `http://localhost:5000/api/articles/${id}/like`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setArticle((prev) => ({
        ...prev,
        likes: response.data.likes,
        liked: response.data.likedBy.includes(user.id),
      }));
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      alert('Please log in to comment');
      navigate('/login');
      return;
    }
    if (!newComment.trim()) {
      alert('Comment cannot be empty');
      return;
    }
    try {
      const response = await axios.post(
        `http://localhost:5000/api/articles/${id}/comments`,
        { text: newComment },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setComments(response.data);
      setNewComment('');
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('Failed to post comment');
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-800 dark:text-gray-100">Loading article...</div>;
  }

  if (!article) {
    return <div className="p-6 text-center text-gray-800 dark:text-gray-100">Article not found</div>;
  }

  return (
    <div className="p-6 bg-gray-100 dark:bg-gray-900 min-h-screen">
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <Link to="/" className="text-indigo-600 dark:text-indigo-400 hover:underline mb-4 inline-block">
          ← Back to Home
        </Link>
        <img
          src={article.image}
          alt={article.title}
          className="w-full h-64 object-cover rounded-md mb-6"
        />
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-4">
          {article.title}
        </h1>
        <div className="text-gray-800 dark:text-gray-100 leading-relaxed mb-6 whitespace-pre-line text-lg">
          {article.fullText}
        </div>
        <div className="flex items-center space-x-4 mb-6">
          <button
            onClick={handleLike}
            className="flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors duration-200"
          >
            {article.liked ? (
              <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V20M4 8l6-4 4 4 6-4V20M4 20h16" />
              </svg>
            )}
            Like ({article.likes})
          </button>
          <button
            onClick={handleToggleTTS}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 transition-colors duration-200 disabled:bg-gray-400 dark:disabled:bg-gray-600"
            disabled={!article.fullText || article.fullText === 'Unable to scrape full text'}
          >
            {isPlaying ? 'Stop Reading' : 'Listen'}
          </button>
        </div>

        {/* Comments Section */}
        <div className="mt-8">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-4">Comments</h2>
          {comments.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-300">No comments yet. Be the first!</p>
          ) : (
            <ul className="space-y-4">
              {comments.map((comment) => (
                <li key={comment._id} className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg shadow-sm">
                  <p className="text-gray-800 dark:text-gray-100">{comment.text}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    By {comment.user.name} on {new Date(comment.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {token ? (
            <form onSubmit={handleCommentSubmit} className="mt-6">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add your comment..."
                className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                rows="3"
              />
              <button
                type="submit"
                className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 transition-colors duration-200"
              >
                Post Comment
              </button>
            </form>
          ) : (
            <p className="mt-4 text-gray-600 dark:text-gray-300">
              <Link to="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                Log in
              </Link>{' '}
              to add a comment.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ArticleDetail;