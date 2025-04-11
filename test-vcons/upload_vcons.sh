#!/bin/bash

# Get the MONGODB_URI from the environment if it exists
MONGODB_URI=${MONGODB_URI:-"mongodb://root:example@localhost:27017/conserver"}

# Find and import all vcon.json files
find . -type f -name "*.vcon.json" | while read -r file; do
    echo "Importing $file into MongoDB..."
    mongoimport   --uri "$MONGODB_URI" -c "vcons" --file "$file" 
done

echo "All matching vcon.json files have been imported."

