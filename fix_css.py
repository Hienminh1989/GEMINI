import re

with open('src/index.css', 'r') as f:
    content = f.read()

# Make sure both utilities are inside @layer utilities
content = content.replace('.animate-heartbeat-blue {', '@layer utilities {\n  .animate-heartbeat-blue {')
content = content.replace('animation: heartbeat-glow-blue 1.5s ease-in-out infinite;\n}', 'animation: heartbeat-glow-blue 1.5s ease-in-out infinite;\n  }\n}')

with open('src/index.css', 'w') as f:
    f.write(content)
