import tensorflow as tf
import tensorflowjs as tfjs
import os
import shutil

# Paths - Updated for .keras format
KERAS_MODEL = 'model/keypoint_classifier/keypoint_classifier.keras'  # ← Changed from .h5
TFJS_OUTPUT = '../../../frontend/public/models/keypoint_classifier'
LABELS_SRC = 'model/keypoint_classifier/keypoint_classifier_label.csv'
LABELS_DST = '../../../frontend/public/models/labels.csv'

print("🔄 Converting model to TensorFlow.js...")

# Load Keras model (.keras format works the same)
model = tf.keras.models.load_model(KERAS_MODEL)

# Create output directory
os.makedirs(TFJS_OUTPUT, exist_ok=True)

# Convert to TensorFlow.js
tfjs.converters.save_keras_model(model, TFJS_OUTPUT)
print(f"✓ Model saved to: {TFJS_OUTPUT}")

# Copy labels
os.makedirs(os.path.dirname(LABELS_DST), exist_ok=True)
shutil.copy(LABELS_SRC, LABELS_DST)
print(f"✓ Labels copied to: {LABELS_DST}")

print("\n✅ Export complete!")
print(f"Files created:")
print(f"  - {TFJS_OUTPUT}/model.json")
print(f"  - {TFJS_OUTPUT}/group1-shard1of1.bin")
print(f"  - {LABELS_DST}")
print("\nYour Next.js app can now use the model.")