import csv
import pandas as pd
import json
import os

def read_csv_file(file_path):
    data = []
    with open(file_path, 'r', encoding='utf-8') as file:
        csv_reader = csv.DictReader(file)
        for row in csv_reader:
            data.append(row)
    
    # Print first 5 rows as sample
    print("CSV Sample (First 5 rows):")
    for i, row in enumerate(data[:5]):
        print(f"Row {i+1}: {json.dumps(row)}")
    
    # Print column names
    if data:
        print("\nCSV Columns:", list(data[0].keys()))
    
    return data

def read_excel_file(file_path):
    df = pd.read_excel(file_path)
    
    # Print first 5 rows as sample
    print("\nExcel Sample (First 5 rows):")
    print(df.head().to_string())
    
    # Print column names
    print("\nExcel Columns:", list(df.columns))
    
    return df

if __name__ == "__main__":
    base_dir = r"C:\Users\katso\OneDrive\Documents\GitHub\MerakiCaptivePortal-firebaseDB\documents\food cost module"
    
    csv_path = os.path.join(base_dir, "Stock Usage 28 - 15 MAR.csv")
    excel_path = os.path.join(base_dir, "food cost tool.xlsx")
    
    print("=== Reading CSV File ===")
    csv_data = read_csv_file(csv_path)
    
    print("\n=== Reading Excel File ===")
    excel_data = read_excel_file(excel_path)
    
    print("\nTotal CSV Rows:", len(csv_data))
    print("Excel Sheet Names:", excel_data.sheet_names if hasattr(excel_data, 'sheet_names') else "Single sheet only")
