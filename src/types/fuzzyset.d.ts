declare module 'fuzzyset' {
    interface FuzzySet {
        get(value: string, limit?: number): Array<[number, string]> | null;
        add(value: string): boolean;
        length(): number;
        isEmpty(): boolean;
        values(): string[];
    }

    function FuzzySet(
        source?: string[],
        useLevenshtein?: boolean,
        gramSizeLower?: number,
        gramSizeUpper?: number
    ): FuzzySet;

    export default FuzzySet;
}
