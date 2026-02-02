# D:\NEWs\news-aggregator\backend\fine_tune.py
from transformers import DistilBertTokenizer, DistilBertForSequenceClassification, Trainer, TrainingArguments
from datasets import load_dataset, Dataset
import pandas as pd
from sklearn.model_selection import train_test_split

# Define Categories
categories = ["Politics", "Sports", "Technology", "Business", "Entertainment", "General"]

# ✅ Load AG News dataset
ag_news = load_dataset("sh0416/ag_news")
ag_categories = {1: 'Politics', 2: 'Sports', 3: 'Business', 4: 'Technology'}  # Map AG labels

# ✅ Map AG News to Your Categories
def map_ag_to_your_categories(example):
    ag_label = ag_categories[example['label']]
    if ag_label == 'Politics':
        return {'label': 'Politics'}  # Approximation
    elif ag_label == 'Sports':
        return {'label': 'Sports'}
    elif ag_label == 'Business':
        return {'label': 'Business'}
    elif ag_label == 'Technology':
        return {'label': 'Technology'}
    return {'label': 'General'}  # Fallback

ag_train = ag_news['train'].map(map_ag_to_your_categories)
ag_test = ag_news['test'].map(map_ag_to_your_categories)

# ✅ Full Custom Dataset (from Your Provided Data)
custom_data = [
    # Politics
    {"title": "Israel strikes Lebanon after first rocket attack since ceasefire", "label": "Politics"},
    {"title": "Trump Aides Panic at Social Security Boss’s Shutdown Threat", "label": "Politics"},
    {"title": "Trump presses Maine governor for ‘full throated apology’ after transgender athlete spat", "label": "Politics"},
    {"title": "Trump revoking protections for 530,000 Cubans, Haitians and other migrants", "label": "Politics"},
    {"title": "Tracking Trump: Education Dept. demise as key agenda items get blocked in court", "label": "Politics"},
    {"title": "Dutton's budget reply is a career- and election-defining test", "label": "Politics"},
    {"title": "MPs could axe clause in bill banning forced labour in GB Energy supply chain", "label": "Politics"},
    {"title": "Labour plan for £2bn in Whitehall cuts will hit frontline services, union warns", "label": "Politics"},
    {"title": "Starmer is warned against ‘appeasing’ Trump with tax cut for US tech firms", "label": "Politics"},
    {"title": "IRS nears deal with ICE to share data of undocumented immigrants – report", "label": "Politics"},

    # Sports
    {"title": "McNeese vs. Purdue odds, prediction: 2025 NCAA Tournament", "label": "Sports"},
    {"title": "American runner Shelby Houlihan medals after 4-year doping ban", "label": "Sports"},
    {"title": "Lindsey Vonn concludes ‘impossible’ comeback at 40 with first podium since 2018", "label": "Sports"},
    {"title": "Mikaela Shiffrin and Co Get Heartwarming Update", "label": "Sports"},
    {"title": "Gonzaga departs the NCAAs: What’s next for the Zags", "label": "Sports"},
    {"title": "Scotland relegated in Nations League", "label": "Sports"},
    {"title": "England overpower Italy in winning start to Women’s Six Nations campaign", "label": "Sports"},
    {"title": "England 38-5 Italy: Women’s Six Nations – as it happened", "label": "Sports"},

    # Technology
    {"title": "The dawn of PCIe 7.0 could mean faster SSDs for everyone", "label": "Technology"},
    {"title": "Surface Laptop 7 returns", "label": "Technology"},
    {"title": "China’s EV breakthrough: helped by state strategies", "label": "Technology"},

    # Entertainment
    {"title": "Assassin's Creed Shadows tops 2 million players", "label": "Entertainment"},
    {"title": "Box Office: ‘Snow White’ Awakens With $16 Million Opening Day", "label": "Entertainment"},
    {"title": "‘Severance’ Team Talks Mark’s Divisive Choice", "label": "Entertainment"},
    {"title": "'Impractical Jokers' star Joe Gatto denies sexual assault allegations", "label": "Entertainment"},

    # Business
    {"title": "Facebook to stop targeting ads at UK woman after legal fight", "label": "Business"},
    {"title": "The Guardian view on Manchester United’s stadium plans", "label": "Business"},
    {"title": "Counter protester arrested at Berkeley Tesla protest", "label": "Business"},

    # General
    {"title": "Pope Francis to be discharged from hospital on Sunday", "label": "General"},
    {"title": "United Airlines pilot forcibly removed a flyer from an airplane bathroom", "label": "General"},
]

# ✅ Add 50 Extra Samples Per Category
for category in categories:
    custom_data.extend([{"title": f"{category} news sample {i}", "label": category} for i in range(1, 51)])

# ✅ Convert to DataFrame
custom_df = pd.DataFrame(custom_data)
train_df, test_df = train_test_split(custom_df, test_size=0.2, random_state=42)

# ✅ Combine AG News and Custom Dataset
train_data = Dataset.from_pandas(pd.concat([pd.DataFrame(ag_train[:5000]), train_df]))  # Limit AG News for speed
test_data = Dataset.from_pandas(pd.concat([pd.DataFrame(ag_test[:1000]), test_df]))

# ✅ Tokenizer
tokenizer = DistilBertTokenizer.from_pretrained('distilbert-base-uncased')
label2id = {category: idx for idx, category in enumerate(categories)}
id2label = {idx: category for category, idx in label2id.items()}

# ✅ Tokenization
def tokenize_function(examples):
    return tokenizer(examples['title'], padding='max_length', truncation=True, max_length=128)

train_dataset = train_data.map(tokenize_function, batched=True)
test_dataset = test_data.map(tokenize_function, batched=True)

train_dataset = train_dataset.map(lambda x: {'labels': label2id[x['label']]}, batched=False)
test_dataset = test_dataset.map(lambda x: {'labels': label2id[x['label']]}, batched=False)

train_dataset.set_format('torch', columns=['input_ids', 'attention_mask', 'labels'])
test_dataset.set_format('torch', columns=['input_ids', 'attention_mask', 'labels'])

# ✅ Load Model
model = DistilBertForSequenceClassification.from_pretrained(
    'distilbert-base-uncased', num_labels=6, id2label=id2label, label2id=label2id
)

# ✅ Training Arguments
training_args = TrainingArguments(
    output_dir='./results',
    num_train_epochs=3,
    per_device_train_batch_size=8,
    per_device_eval_batch_size=8,
    warmup_steps=500,
    weight_decay=0.01,
    logging_dir='./logs',
    logging_steps=10,
    evaluation_strategy='epoch',
    save_strategy='epoch',
    load_best_model_at_end=True,
)

# ✅ Trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=test_dataset,
)

# ✅ Train Model
trainer.train()

# ✅ Save Model
model.save_pretrained('D:/NEWs/news-aggregator/backend/categorizer_model')
tokenizer.save_pretrained('D:/NEWs/news-aggregator/backend/categorizer_model')

print("✅ Model fine-tuned and saved successfully!")
