# D:\NEWs\news-aggregator\backend\categorizer.py
from flask import Flask, request, jsonify
from transformers import DistilBertTokenizer, DistilBertForSequenceClassification
import torch
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Load fine-tuned model
model_path = 'D:/NEWs/news-aggregator/backend/categorizer_model'
tokenizer = DistilBertTokenizer.from_pretrained(model_path)
model = DistilBertForSequenceClassification.from_pretrained(model_path)
model.eval()

@app.route('/categorize', methods=['POST'])
def categorize():
    data = request.get_json()
    title = data.get('title', '')
    if not title:
        return jsonify({'error': 'No title provided'}), 400
    
    try:
        inputs = tokenizer(title, padding='max_length', truncation=True, max_length=128, return_tensors='pt')
        with torch.no_grad():
            outputs = model(**inputs)
        predicted_id = torch.argmax(outputs.logits, dim=1).item()
        category = model.config.id2label[predicted_id]
        logging.info(f"Categorized '{title}' as {category}")
        return jsonify({'category': category})
    except Exception as e:
        logging.error(f"Error categorizing: {e}")
        return jsonify({'error': 'Categorization failed'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)