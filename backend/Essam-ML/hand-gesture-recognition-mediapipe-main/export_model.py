import tensorflow as tf
import tensorflowjs as tfjs
import os
import shutil
import json

# Paths
KERAS_MODEL = 'model/keypoint_classifier/keypoint_classifier.keras'
TFJS_OUTPUT = '../../../frontend/public/models/keypoint_classifier'
LABELS_SRC = 'model/keypoint_classifier/keypoint_classifier_label.csv'
LABELS_DST = '../../../frontend/public/models/labels.csv'

print("🔄 Converting model to TensorFlow.js...")

# Load the original Keras model
original_model = tf.keras.models.load_model(KERAS_MODEL)
print(f"✓ Original model loaded")
print(f"  Input shape: {original_model.input_shape}")
print(f"  Output shape: {original_model.output_shape}")

# Create output directory
os.makedirs(TFJS_OUTPUT, exist_ok=True)

# Export the model as-is first
print("\n💾 Converting to TensorFlow.js format...")
tfjs.converters.save_keras_model(original_model, TFJS_OUTPUT)
print(f"✓ Initial model saved to: {TFJS_OUTPUT}")

# Now fix the model.json file
model_json_path = os.path.join(TFJS_OUTPUT, 'model.json')
print(f"\n🔧 Fixing model.json...")

with open(model_json_path, 'r') as f:
    model_data = json.load(f)

print(f"  Model topology keys: {list(model_data.get('modelTopology', {}).keys())}")

# Find and fix the InputLayer or first layer
if 'modelTopology' in model_data:
    topology = model_data['modelTopology']
    
    # Handle different model formats
    if 'model_config' in topology:
        # Newer format
        config = topology['model_config']
        if 'config' in config:
            config = config['config']
    elif 'config' in topology:
        # Direct config
        config = topology['config']
    else:
        # Try to find config in the topology
        config = topology
    
    print(f"  Config keys: {list(config.keys())}")
    
    if 'layers' in config:
        # Check if first layer is InputLayer
        first_layer = config['layers'][0]
        print(f"  First layer class: {first_layer.get('class_name', 'Unknown')}")
        print(f"  First layer config keys: {list(first_layer.get('config', {}).keys())}")
        
        if first_layer['class_name'] == 'InputLayer':
            print(f"  Found InputLayer, fixing config...")
            # Fix the InputLayer config
            first_layer['config']['batch_input_shape'] = [None, 42]
            if 'dtype' not in first_layer['config']:
                first_layer['config']['dtype'] = 'float32'
        else:
            # First layer is not InputLayer, add batch_input_shape to it
            print(f"  First layer is {first_layer['class_name']}, adding batch_input_shape...")
            first_layer['config']['batch_input_shape'] = [None, 42]

# Save the fixed model.json
with open(model_json_path, 'w') as f:
    json.dump(model_data, f, indent=2)

print(f"✓ model.json fixed")

# Copy labels
os.makedirs(os.path.dirname(LABELS_DST), exist_ok=True)
shutil.copy(LABELS_SRC, LABELS_DST)
print(f"✓ Labels copied to: {LABELS_DST}")

# Verify output files
print("\n✅ Export complete!")
print(f"\nFiles created:")
for file in sorted(os.listdir(TFJS_OUTPUT)):
    filepath = os.path.join(TFJS_OUTPUT, file)
    size = os.path.getsize(filepath)
    print(f"  - {file} ({size:,} bytes)")
print(f"  - {LABELS_DST}")

print("\n📋 Model Summary:")
print(f"  Input: [batch_size, 42]")
print(f"  Output: [batch_size, {original_model.output_shape[1]}]")
print(f"  Total parameters: {original_model.count_params():,}")
print("\n✨ Your Next.js app can now use the model!")